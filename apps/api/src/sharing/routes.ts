/**
 * Sharing recordings with the teacher (story 15.4), mounted at /api/v1:
 *
 *   GET    /me/shared-recordings          → { targets, items }               (recording:share)
 *          the classes the learner may share with, and what they shared (with play URLs
 *          and the teacher's comment)
 *   POST   /me/shared-recordings  multipart { audio, text, classId, score? } → 201 { id }
 *          opt-in per recording; only the class's teachers hear it
 *   DELETE /me/shared-recordings/:id      → 204: withdrawn, the file is deleted
 *   GET    /classes/:id/shared-recordings → { items }       (class:recordings:listen)
 *   PATCH  /classes/:id/shared-recordings/:recordingId { comment?, heard? } → 204
 *          the class's teachers only; admins do not hear learners' recordings
 *   PUT    /classes/:id/members/:userId/consent { consent } → 204          (class:manage)
 *          parents' consent in a class of minors (audit-logged); revoking deletes what the
 *          learner shared
 *
 * Files go to the private uploads bucket and are played through short-lived presigned URLs.
 */
import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv, type AuthorizeLog } from '../authz/middleware.js';
import type { ClassScope } from '../authz/policies.js';
import { clipExtension } from '../media/transcribe.js';
import { RateLimiter } from '../observability/tunnel.js';
import type { ObjectStorage } from '../storage/objectStorage.js';
import type { SharedRecording, SharingRepository } from './repository.js';

export interface SharingRouteDeps {
  auth: AuthResolver;
  log: AuthorizeLog & {
    info(obj: object, msg: string): void;
    error(obj: object, msg: string): void;
  };
  repo: SharingRepository;
  classes: { scope(classId: string, userId: string): Promise<ClassScope> };
  storage: Pick<ObjectStorage, 'put' | 'delete' | 'presignGet'>;
  /** Deletes files whose rows are gone (see `purgeDeletedFiles`). */
  purge: () => Promise<number>;
  /** Per-learner limiter factory for new shares (tests pass a tight one). */
  limiter?: () => RateLimiter;
}

/** A shared sentence is a few seconds; 5 MB leaves room for uncompressed iPhone audio. */
export const MAX_SHARED_BYTES = 5 * 1024 * 1024;
const MIN_SHARED_BYTES = 512;
const MAX_TEXT_LENGTH = 300;
const PLAY_URL_SECONDS = 60 * 60;

const Uuid = z.string().uuid();
const Review = z
  .object({
    comment: z.string().trim().max(500).nullable().optional(),
    heard: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.comment !== undefined || v.heard !== undefined);
const Consent = z.object({ consent: z.boolean() }).strict();

const SHARE_ERRORS = {
  not_member: 403,
  consent_needed: 403,
  too_many: 409,
} as const;

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

export function createSharingRoutes(deps: SharingRouteDeps): Hono<ActorEnv> {
  const app = new Hono<ActorEnv>();
  const share = authorize(deps.auth, 'recording:share', deps.log);
  const classScope = async (c: Context, actor: { id: string }) => {
    const id = Uuid.safeParse(c.req.param('id'));
    return id.success ? deps.classes.scope(id.data, actor.id) : { classRole: null };
  };
  const listen = authorize(deps.auth, 'class:recordings:listen', deps.log, classScope);
  const manage = authorize(deps.auth, 'class:manage', deps.log, classScope);

  const newLimiter = deps.limiter ?? (() => new RateLimiter(10, 60_000));
  const limiters = new Map<string, RateLimiter>();
  const limiterFor = (userId: string) => {
    let limiter = limiters.get(userId);
    if (!limiter) {
      limiter = newLimiter();
      limiters.set(userId, limiter);
    }
    return limiter;
  };

  const purgeNow = async (context: object) => {
    try {
      await deps.purge();
    } catch (error) {
      // The file stays queued; the worker's maintenance run deletes it later.
      deps.log.error(
        { ...context, err: (error as Error).message },
        'sharing.purge_deferred'
      );
    }
  };

  const playable = async (r: SharedRecording) => ({
    id: r.id,
    classId: r.classId,
    className: r.className,
    text: r.text,
    score: r.score,
    comment: r.comment,
    commentedAt: r.commentedAt,
    heardAt: r.heardAt,
    createdAt: r.createdAt,
    url: await deps.storage.presignGet('uploads', r.objectKey, PLAY_URL_SECONDS),
  });

  app.get('/me/shared-recordings', share, async (c) => {
    const actor = c.get('actor');
    const [targets, items] = await Promise.all([
      deps.repo.targets(actor.id),
      deps.repo.mine(actor.id),
    ]);
    c.header('Cache-Control', 'no-store');
    return c.json({ targets, items: await Promise.all(items.map(playable)) });
  });

  app.post(
    '/me/shared-recordings',
    bodyLimit({
      maxSize: MAX_SHARED_BYTES + 16 * 1024,
      onError: (c) => c.json({ error: 'payload_too_large' }, 413),
    }),
    share,
    async (c) => {
      const actor = c.get('actor');
      if (!limiterFor(actor.id).tryTake()) return c.json({ error: 'rate_limited' }, 429);
      let form: FormData;
      try {
        form = await c.req.formData();
      } catch (error) {
        if (error instanceof TypeError) return c.json({ error: 'invalid_body' }, 400);
        throw error;
      }
      const audio = form.get('audio');
      const rawText = form.get('text');
      const text = typeof rawText === 'string' ? rawText.trim() : '';
      const classId = Uuid.safeParse(form.get('classId'));
      const rawScore = form.get('score');
      const score =
        typeof rawScore === 'string' && rawScore !== '' ? Number(rawScore) : null;
      if (
        !(audio instanceof Blob) ||
        text === '' ||
        text.length > MAX_TEXT_LENGTH ||
        !classId.success ||
        (score !== null && !(score >= 0 && score <= 1))
      ) {
        return c.json({ error: 'invalid_body' }, 400);
      }
      const extension = clipExtension(audio.type);
      if (!extension) return c.json({ error: 'unsupported_audio' }, 415);
      if (audio.size < MIN_SHARED_BYTES) return c.json({ error: 'audio_too_short' }, 400);

      const check = await deps.repo.check(actor.id, classId.data);
      if (check !== 'ok') return c.json({ error: check }, SHARE_ERRORS[check]);

      const id = randomUUID();
      const objectKey = `shared/${classId.data}/${actor.id}/${id}.${extension}`;
      // Stored without codec parameters: the player only needs the container type.
      const contentType = audio.type.split(';')[0]!.trim().toLowerCase();
      await deps.storage.put(
        'uploads',
        objectKey,
        new Uint8Array(await audio.arrayBuffer()),
        contentType
      );
      try {
        await deps.repo.add({
          id,
          userId: actor.id,
          classId: classId.data,
          objectKey,
          contentType,
          sizeBytes: audio.size,
          text,
          score,
        });
      } catch (error) {
        // No row points at the file: remove it again.
        await deps.storage.delete('uploads', objectKey);
        throw error;
      }
      deps.log.info(
        { userId: actor.id, classId: classId.data, bytes: audio.size },
        'sharing.shared'
      );
      return c.json({ id }, 201);
    }
  );

  app.delete('/me/shared-recordings/:id', share, async (c) => {
    const actor = c.get('actor');
    const id = Uuid.safeParse(c.req.param('id'));
    if (!id.success || !(await deps.repo.withdraw(actor.id, id.data))) {
      return c.json({ error: 'not_found' }, 404);
    }
    deps.log.info({ userId: actor.id, recordingId: id.data }, 'sharing.withdrawn');
    await purgeNow({ userId: actor.id });
    return c.body(null, 204);
  });

  app.get('/classes/:id/shared-recordings', listen, async (c) => {
    const items = await deps.repo.forClass(c.req.param('id'));
    c.header('Cache-Control', 'no-store');
    return c.json({
      items: await Promise.all(
        items.map(async (r) => ({ ...(await playable(r)), learner: r.learner }))
      ),
    });
  });

  app.patch('/classes/:id/shared-recordings/:recordingId', listen, async (c) => {
    const id = Uuid.safeParse(c.req.param('recordingId'));
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    const parsed = Review.safeParse(await readJson(c));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const comment =
      parsed.data.comment === undefined ? undefined : parsed.data.comment || null;
    const found = await deps.repo.review(c.req.param('id'), id.data, {
      comment,
      heard: parsed.data.heard,
    });
    return found ? c.body(null, 204) : c.json({ error: 'not_found' }, 404);
  });

  app.put('/classes/:id/members/:userId/consent', manage, async (c) => {
    const classId = Uuid.safeParse(c.req.param('id'));
    const userId = Uuid.safeParse(c.req.param('userId'));
    if (!classId.success || !userId.success) return c.json({ error: 'not_found' }, 404);
    const parsed = Consent.safeParse(await readJson(c));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const actor = { id: c.get('actor').id, ip: c.req.header('x-real-ip') ?? null };
    const found = await deps.repo.setConsent(
      actor,
      classId.data,
      userId.data,
      parsed.data.consent
    );
    if (!found) return c.json({ error: 'not_found' }, 404);
    if (!parsed.data.consent) await purgeNow({ classId: classId.data });
    return c.body(null, 204);
  });

  return app;
}
