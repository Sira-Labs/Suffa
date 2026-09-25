/**
 * Recordings of a class (Sprint 7), mounted at /api/v1:
 *
 *   GET    /classes/:id/media                      → { items }   (class:read; members see published)
 *   POST   /classes/:id/media   { title, fileName, size, contentType } → upload plan (class:manage)
 *   POST   /classes/:id/media/:mediaId/parts  { partNumbers } → { urls }       (class:manage)
 *   GET    /classes/:id/media/:mediaId/parts       → { parts } (resume)       (class:manage)
 *   POST   /classes/:id/media/:mediaId/complete    → 202                      (class:manage)
 *   POST   /classes/:id/media/:mediaId/publish { consent: true } → 204       (class:manage)
 *   DELETE /classes/:id/media/:mediaId             → 204                      (class:manage)
 *   GET    /classes/:id/media/:mediaId/play        → { audio, video, … }      (class:read)
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv, type AuthorizeLog } from '../authz/middleware.js';
import type { Actor as PolicyActor, ClassScope } from '../authz/policies.js';
import { writeAudit, type Queryable } from '../audit/log.js';
import { MAX_PART_URLS, MAX_RECORDING_BYTES, type Media } from './service.js';
import type { MediaItem, MediaRepository } from './repository.js';

export interface MediaRouteDeps {
  classes: { scope(classId: string, userId: string): Promise<ClassScope> };
  repo: MediaRepository;
  media: Media;
  audit: Queryable;
  auth: AuthResolver;
  log: AuthorizeLog;
}

const Uuid = z.string().uuid();
const NewUpload = z
  .object({
    title: z.string().trim().min(1).max(120),
    fileName: z.string().trim().min(1).max(255),
    size: z.number().int().min(1).max(MAX_RECORDING_BYTES),
    contentType: z.string().max(100),
  })
  .strict();
const Parts = z
  .object({
    partNumbers: z.array(z.number().int().min(1).max(10_000)).min(1).max(MAX_PART_URLS),
  })
  .strict();
const Publish = z.object({ consent: z.literal(true) }).strict();

/** What a list shows about an item (no storage keys). */
function view(item: MediaItem) {
  return {
    id: item.id,
    title: item.title,
    source: item.source,
    status: item.status,
    progress: item.progress,
    durationSec: item.durationSec,
    hasVideo: item.hasVideo,
    originalName: item.originalName,
    originalSize: item.originalSize,
    error: item.error,
    publishedAt: item.publishedAt,
    createdAt: item.createdAt,
  };
}

export function createMediaRoutes(deps: MediaRouteDeps): Hono<ActorEnv> {
  const app = new Hono<ActorEnv>();
  const scope = async (c: Context, actor: PolicyActor) => {
    const id = Uuid.safeParse(c.req.param('id'));
    return id.success ? deps.classes.scope(id.data, actor.id) : { classRole: null };
  };
  const manage = authorize(deps.auth, 'class:manage', deps.log, scope);
  const read = authorize(deps.auth, 'class:read', deps.log, scope);

  /** Teachers of the class (and admins) see unpublished items too. */
  const isManager = async (c: Context<ActorEnv>) => {
    const actor = c.get('actor');
    if (actor.role === 'admin') return true;
    return (
      (await deps.classes.scope(c.req.param('id')!, actor.id)).classRole === 'teacher'
    );
  };
  const itemOf = async (c: Context<ActorEnv>) => {
    const mediaId = Uuid.safeParse(c.req.param('mediaId'));
    return mediaId.success ? deps.repo.get(c.req.param('id')!, mediaId.data) : null;
  };
  const audit = (c: Context<ActorEnv>, action: string, item: MediaItem) =>
    writeAudit(deps.audit, {
      actorId: c.get('actor').id,
      action,
      targetType: 'media',
      targetId: item.id,
      details: { classId: item.classId, title: item.title },
      ipAddress: c.req.header('x-real-ip') ?? null,
    });

  app.get('/classes/:id/media', read, async (c) => {
    c.header('Cache-Control', 'no-store');
    const items = await deps.repo.list(c.req.param('id'), !(await isManager(c)));
    return c.json({ items: items.map(view) });
  });

  app.post('/classes/:id/media', manage, async (c) => {
    const parsed = NewUpload.safeParse(await readJson(c));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const result = await deps.media.start(
      c.req.param('id'),
      c.get('actor').id,
      parsed.data
    );
    if (!result.ok) return c.json({ error: result.reason }, 422);
    await audit(c, 'media.upload_started', result.item);
    return c.json(
      { item: view(result.item), partSize: result.partSize, partCount: result.partCount },
      201
    );
  });

  app.post('/classes/:id/media/:mediaId/parts', manage, async (c) => {
    const item = await itemOf(c);
    if (!item || item.status !== 'uploading') return c.json({ error: 'not_found' }, 404);
    const parsed = Parts.safeParse(await readJson(c));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    c.header('Cache-Control', 'no-store');
    return c.json({ urls: await deps.media.partUrls(item, parsed.data.partNumbers) });
  });

  app.get('/classes/:id/media/:mediaId/parts', manage, async (c) => {
    const item = await itemOf(c);
    if (!item || item.status !== 'uploading') return c.json({ error: 'not_found' }, 404);
    const parts = await deps.media.uploadedParts(item);
    return c.json({ parts: parts.map((p) => p.partNumber) });
  });

  app.post('/classes/:id/media/:mediaId/complete', manage, async (c) => {
    const item = await itemOf(c);
    if (!item || item.status !== 'uploading') return c.json({ error: 'not_found' }, 404);
    if (!(await deps.media.complete(item)))
      return c.json({ error: 'parts_missing' }, 409);
    return c.body(null, 202);
  });

  app.post('/classes/:id/media/:mediaId/publish', manage, async (c) => {
    const item = await itemOf(c);
    if (!item || item.status !== 'ready') return c.json({ error: 'not_found' }, 404);
    // Recordings show people: the teacher confirms everyone agreed (story 8.3).
    if (!Publish.safeParse(await readJson(c)).success) {
      return c.json({ error: 'consent_required' }, 400);
    }
    await deps.repo.publish(item.id, c.get('actor').id);
    await audit(c, 'media.published', item);
    return c.body(null, 204);
  });

  app.delete('/classes/:id/media/:mediaId', manage, async (c) => {
    const item = await itemOf(c);
    if (!item) return c.json({ error: 'not_found' }, 404);
    await deps.media.remove(item);
    await audit(c, 'media.deleted', item);
    return c.body(null, 204);
  });

  app.get('/classes/:id/media/:mediaId/play', read, async (c) => {
    const item = await itemOf(c);
    const visible =
      item?.status === 'ready' && (item.publishedAt || (await isManager(c)));
    if (!item || !visible) return c.json({ error: 'not_found' }, 404);
    c.header('Cache-Control', 'no-store');
    return c.json({ ...view(item), ...(await deps.media.playUrls(item)) });
  });

  return app;
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}
