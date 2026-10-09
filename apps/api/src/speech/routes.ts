/**
 * Pronunciation feedback on the server (stories 15.2/15.3, ADR-0022), mounted at /api/v1:
 *
 *   GET  /speech/settings   → { server }                       (speech:assess)
 *        whether this learner's recordings may be assessed here: a speech recogniser is
 *        configured and none of their classes turned it off
 *   POST /speech/assess     multipart { audio, text } → Assessment   (speech:assess)
 *        the learner's own recording of `text` (vocalised Arabic): transcribed by the
 *        recogniser (Mistral EU), then rated letter by letter
 *   GET  /classes/:id/speech         → { serverSpeech }            (class:manage)
 *   PUT  /classes/:id/speech         { serverSpeech } → 204        (class:manage)
 *        whether the class's learners may use it (default on, off for classes of minors)
 *
 * The audio is kept in memory for the one request and never stored or logged; neither is
 * the transcript. A per-learner rate limit protects the recogniser's budget.
 */
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { assessLetters, G2pError, g2p } from '@suffa/phonology';
import { z } from 'zod';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv, type AuthorizeLog } from '../authz/middleware.js';
import type { ClassScope } from '../authz/policies.js';
import { clipExtension } from '../media/transcribe.js';
import { RateLimiter } from '../observability/tunnel.js';
import type { SpeechRepository } from './repository.js';

/** Turns a short clip into text; undefined when no recogniser is configured. */
export type ClipTranscriber = (clip: {
  bytes: Uint8Array;
  mimeType: string;
}) => Promise<string>;

export interface SpeechRouteDeps {
  auth: AuthResolver;
  log: AuthorizeLog & {
    info(obj: object, msg: string): void;
    error(obj: object, msg: string): void;
  };
  speech: SpeechRepository;
  classes: { scope(classId: string, userId: string): Promise<ClassScope> };
  transcribe: ClipTranscriber | undefined;
  /** Per-learner limiter factory (tests pass a tight one). */
  limiter?: () => RateLimiter;
}

/** A sentence read aloud is a few seconds; 2 MB holds a minute of compressed audio. */
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const MIN_AUDIO_BYTES = 512;
const MAX_TEXT_LENGTH = 300;

const ClassSetting = z.object({ serverSpeech: z.boolean() }).strict();

export function createSpeechRoutes(deps: SpeechRouteDeps): Hono<ActorEnv> {
  const app = new Hono<ActorEnv>();
  const use = authorize(deps.auth, 'speech:assess', deps.log);
  const newLimiter = deps.limiter ?? (() => new RateLimiter(20, 60_000));
  const limiters = new Map<string, RateLimiter>();
  const limiterFor = (userId: string) => {
    let limiter = limiters.get(userId);
    if (!limiter) {
      limiter = newLimiter();
      limiters.set(userId, limiter);
    }
    return limiter;
  };

  const manage = authorize(deps.auth, 'class:manage', deps.log, async (c, actor) => {
    const id = z.string().uuid().safeParse(c.req.param('id'));
    return id.success ? deps.classes.scope(id.data, actor.id) : { classRole: null };
  });

  app.get('/classes/:id/speech', manage, async (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({ serverSpeech: await deps.speech.classSetting(c.req.param('id')) });
  });

  app.put('/classes/:id/speech', manage, async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
    const parsed = ClassSetting.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    await deps.speech.setClassSetting(c.req.param('id'), parsed.data.serverSpeech);
    return c.body(null, 204);
  });

  app.get('/speech/settings', use, async (c) => {
    c.header('Cache-Control', 'no-store');
    const server =
      deps.transcribe !== undefined && (await deps.speech.allowedFor(c.get('actor').id));
    return c.json({ server });
  });

  app.post(
    '/speech/assess',
    bodyLimit({
      maxSize: MAX_AUDIO_BYTES + 16 * 1024,
      onError: (c) => c.json({ error: 'payload_too_large' }, 413),
    }),
    use,
    async (c) => {
      const actor = c.get('actor');
      if (!deps.transcribe) return c.json({ error: 'speech_unavailable' }, 503);
      if (!limiterFor(actor.id).tryTake()) return c.json({ error: 'rate_limited' }, 429);
      if (!(await deps.speech.allowedFor(actor.id))) {
        return c.json({ error: 'speech_off_for_class' }, 403);
      }

      let form: FormData;
      try {
        form = await c.req.formData();
      } catch (error) {
        if (error instanceof TypeError) return c.json({ error: 'invalid_body' }, 400);
        throw error;
      }
      const audio = form.get('audio');
      const raw = form.get('text');
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (!(audio instanceof Blob) || text === '' || text.length > MAX_TEXT_LENGTH) {
        return c.json({ error: 'invalid_body' }, 400);
      }
      if (!clipExtension(audio.type)) return c.json({ error: 'unsupported_audio' }, 415);
      if (audio.size < MIN_AUDIO_BYTES) return c.json({ error: 'audio_too_short' }, 400);
      // Checked before the (paid) recogniser runs.
      try {
        g2p(text);
      } catch (error) {
        if (error instanceof G2pError) return c.json({ error: 'invalid_text' }, 400);
        throw error;
      }

      let transcript: string;
      try {
        transcript = await deps.transcribe({
          bytes: new Uint8Array(await audio.arrayBuffer()),
          mimeType: audio.type,
        });
      } catch (error) {
        deps.log.error(
          { userId: actor.id, err: (error as Error).message },
          'speech.transcribe_failed'
        );
        return c.json({ error: 'speech_unavailable' }, 503);
      }

      const assessment = assessLetters(text, transcript);
      deps.log.info(
        {
          userId: actor.id,
          letters: assessment.letters.length,
          score: Math.round(assessment.score * 100),
        },
        'speech.assessed'
      );
      return c.json(assessment);
    }
  );

  return app;
}
