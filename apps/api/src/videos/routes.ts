/**
 * Video lessons (Sprint 12, ADR-0012).
 *
 * Public (the catalog is the same for everyone, signed in or not):
 *   GET /videos?unit=n             → { videos }
 *   GET /videos/:id                → { video, checkpoints, transcript }  (the last two only
 *                                    when the creator granted permission)
 *
 * Admin (admin + second factor, `admin:videos`), mounted at /admin/videos:
 *   GET    /                               → { channels, videos, importEnabled }
 *   POST   /channels                       { name, youtubeChannelId?, playlists } → { id }
 *   PATCH  /channels/:id                   { name?, playlists?, permissionStatus?,
 *                                            permissionNotes?, contactedAt? } → 204
 *   POST   /channels/:id/import            → 202
 *   PATCH  /:videoId                       { unit?, hidden? } → 204
 *   PUT    /:videoId/transcript            { cues } → 204
 *   POST   /:videoId/checkpoints           { atSec, data } → 201
 *   DELETE /:videoId/checkpoints/:cpId     → 204
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv, type AuthorizeLog } from '../authz/middleware.js';
import { CheckpointData, Cues } from '../media/interactive.js';
import type { PgVideoRepository } from './repository.js';

export interface VideoRouteDeps {
  videos: PgVideoRepository;
  /** Queues a channel import; absent without a YouTube API key. */
  enqueueImport?: (channelId: string) => Promise<void>;
  auth: AuthResolver;
  log: AuthorizeLog;
}

const Uuid = z.string().uuid();
const PlaylistId = z
  .string()
  .regex(/^(PL|UU|OL|FL|LL)[A-Za-z0-9_-]{10,40}$/, 'playlist id');
const NewChannel = z
  .object({
    name: z.string().trim().min(1).max(120),
    youtubeChannelId: z
      .string()
      .regex(/^UC[A-Za-z0-9_-]{22}$/)
      .nullable()
      .default(null),
    playlists: z.array(PlaylistId).max(20).default([]),
  })
  .strict();
const ChannelPatch = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    playlists: z.array(PlaylistId).max(20).optional(),
    permissionStatus: z.enum(['unknown', 'requested', 'granted', 'declined']).optional(),
    permissionNotes: z.string().max(4000).optional(),
    contactedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  })
  .strict();
const VideoPatch = z
  .object({
    unit: z.number().int().min(1).max(100).nullable().optional(),
    hidden: z.boolean().optional(),
  })
  .strict();
const NewCheckpoint = z
  .object({
    atSec: z
      .number()
      .min(0)
      .max(24 * 3600),
    data: CheckpointData,
  })
  .strict();

async function body(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

const change = (c: Context<ActorEnv>) => ({
  actorId: c.get('actor').id,
  ipAddress: c.req.header('x-real-ip') ?? null,
});

export function createVideoRoutes(deps: VideoRouteDeps): Hono {
  const app = new Hono();

  app.get('/videos', async (c) => {
    const unit = z.coerce.number().int().min(1).max(100).safeParse(c.req.query('unit'));
    c.header('Cache-Control', 'public, max-age=300');
    return c.json({
      videos: await deps.videos.publicVideos(unit.success ? unit.data : null),
    });
  });

  app.get('/videos/:id', async (c) => {
    const id = Uuid.safeParse(c.req.param('id'));
    const video = id.success ? await deps.videos.publicVideo(id.data) : null;
    if (!video) return c.json({ error: 'not_found' }, 404);
    // Transcripts and exercises need the creator's permission (ADR-0012).
    const [checkpoints, transcript] = video.interactive
      ? await Promise.all([
          deps.videos.checkpoints(video.id),
          deps.videos.transcript(video.id),
        ])
      : [[], []];
    c.header('Cache-Control', 'public, max-age=60');
    return c.json({ video, checkpoints, transcript });
  });

  const admin = new Hono<ActorEnv>();
  const read = authorize(deps.auth, 'admin:videos', deps.log);

  admin.get('/', read, async (c) => {
    const [channels, videos] = await Promise.all([
      deps.videos.channels(),
      deps.videos.adminVideos(),
    ]);
    c.header('Cache-Control', 'no-store');
    return c.json({ channels, videos, importEnabled: Boolean(deps.enqueueImport) });
  });

  admin.post('/channels', read, async (c) => {
    const parsed = NewChannel.safeParse(await body(c));
    if (!parsed.success) {
      return c.json(
        { error: 'invalid_body', issues: parsed.error.issues.map((i) => i.message) },
        400
      );
    }
    return c.json({ id: await deps.videos.createChannel(parsed.data, change(c)) }, 201);
  });

  admin.patch('/channels/:id', read, async (c) => {
    const id = Uuid.safeParse(c.req.param('id'));
    const parsed = ChannelPatch.safeParse(await body(c));
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    return (await deps.videos.updateChannel(id.data, parsed.data, change(c)))
      ? c.body(null, 204)
      : c.json({ error: 'not_found' }, 404);
  });

  admin.post('/channels/:id/import', read, async (c) => {
    const id = Uuid.safeParse(c.req.param('id'));
    if (!id.success || !(await deps.videos.channel(id.data))) {
      return c.json({ error: 'not_found' }, 404);
    }
    if (!deps.enqueueImport) return c.json({ error: 'import_unavailable' }, 409);
    await deps.enqueueImport(id.data);
    return c.body(null, 202);
  });

  admin.patch('/:videoId', read, async (c) => {
    const id = Uuid.safeParse(c.req.param('videoId'));
    const parsed = VideoPatch.safeParse(await body(c));
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    return (await deps.videos.updateVideo(id.data, parsed.data))
      ? c.body(null, 204)
      : c.json({ error: 'not_found' }, 404);
  });

  admin.put('/:videoId/transcript', read, async (c) => {
    const id = Uuid.safeParse(c.req.param('videoId'));
    const parsed = z
      .object({ cues: Cues })
      .strict()
      .safeParse(await body(c));
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const cues = parsed.data.cues
      .filter((cue) => cue.text && cue.end >= cue.start)
      .sort((a, b) => a.start - b.start);
    await deps.videos.saveTranscript(id.data, cues, c.get('actor').id);
    return c.body(null, 204);
  });

  admin.post('/:videoId/checkpoints', read, async (c) => {
    const id = Uuid.safeParse(c.req.param('videoId'));
    const parsed = NewCheckpoint.safeParse(await body(c));
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const { atSec, data } = parsed.data;
    if (data.kind === 'mcq' && data.answer >= data.options.length) {
      return c.json({ error: 'invalid_body' }, 400);
    }
    return c.json(
      await deps.videos.addCheckpoint(id.data, atSec, data, c.get('actor').id),
      201
    );
  });

  admin.delete('/:videoId/checkpoints/:cpId', read, async (c) => {
    const id = Uuid.safeParse(c.req.param('videoId'));
    const cp = Uuid.safeParse(c.req.param('cpId'));
    if (!id.success || !cp.success) return c.json({ error: 'not_found' }, 404);
    return (await deps.videos.removeCheckpoint(id.data, cp.data))
      ? c.body(null, 204)
      : c.json({ error: 'not_found' }, 404);
  });

  app.route('/admin/videos', admin);
  return app;
}
