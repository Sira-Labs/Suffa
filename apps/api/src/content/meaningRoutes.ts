/**
 * Meanings in further languages (story 18.4, ADR-0031), mounted at /api/v1:
 *
 *   GET  /content/units/:course/:unit/meanings/:language        → { words }     (content:review)
 *   POST /content/units/:course/:unit/meanings/:language/draft  → { drafted, remaining }
 *                                                                               (content:write)
 *   POST /content/meaning-drafts/:id/review { decision, seen, text? } → { draft }
 *                                                                               (content:review)
 *   POST /content/meanings/publish                              → { version }   (content:write)
 *
 * An admin has the LLM draft the meanings of a unit's words; a teacher approves (as drafted
 * or corrected) or rejects each one, and never one they had drafted themselves
 * (403 `own_draft`). A decision names the text the reviewer saw (`seen`): 409 `draft_changed`
 * when it was drafted again meanwhile, 409 `source_changed` when the word's German changed.
 *
 * Approved meanings reach learners with the next content bundle (ADR-0032): when a unit is
 * published, at start-up, or when an admin publishes them here (`version` is null when the
 * newest bundle already has them all).
 */
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv, type AuthorizeLog } from '../authz/middleware.js';
import type { Action } from '../authz/policies.js';
import {
  draftMeanings,
  isMeaningDraftLanguage,
  MAX_MEANING_LENGTH,
  type DraftMeaningsDeps,
  type MeaningDraft,
  type MeaningDraftRepository,
} from './meaningDrafts.js';
import { unitId, type ContentActor, type ContentRepository } from './repository.js';

export interface MeaningRouteDeps {
  content: Pick<ContentRepository, 'get' | 'ensureBundle'>;
  drafts: MeaningDraftRepository;
  /** Without the LLM gateway the draft route answers 503. */
  gateway?: DraftMeaningsDeps['gateway'];
  auth: AuthResolver;
  log: AuthorizeLog;
}

const Params = z.object({
  course: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  unit: z.coerce.number().int().min(1).max(999),
  language: z.string().refine(isMeaningDraftLanguage),
});

/** The draft text the reviewer saw; the decision counts for that text only. */
const Seen = z.string().min(1).max(MAX_MEANING_LENGTH);
const ReviewBody = z.discriminatedUnion('decision', [
  z
    .object({
      decision: z.literal('approved'),
      seen: Seen,
      text: z.string().trim().min(1).max(MAX_MEANING_LENGTH).optional(),
    })
    .strict(),
  z.object({ decision: z.literal('rejected'), seen: Seen }).strict(),
]);

/** A word of the unit with its draft in the language, if there is one. */
interface WordWithDraft {
  wordId: string;
  ar: string;
  de: string;
  draft:
    | (Pick<MeaningDraft, 'id' | 'text' | 'status' | 'model' | 'reviewedAt'> & {
        /** The German changed since the draft: it must be drafted again before approval. */
        stale: boolean;
        /** The caller ordered this draft, so someone else decides on it. */
        own: boolean;
      })
    | null;
}

export function createMeaningRoutes(deps: MeaningRouteDeps): Hono<ActorEnv> {
  const app = new Hono<ActorEnv>();
  const guard = (action: Action) => authorize(deps.auth, action, deps.log);
  const actorOf = (c: Context<ActorEnv>): ContentActor => ({
    id: c.get('actor').id,
    ipAddress: c.req.header('x-real-ip') ?? null,
  });
  const small = bodyLimit({
    maxSize: 8 * 1024,
    onError: (c) => c.json({ error: 'payload_too_large' }, 413),
  });

  app.get(
    '/content/units/:course/:unit/meanings/:language',
    guard('content:review'),
    async (c) => {
      const p = Params.safeParse(c.req.param());
      if (!p.success) return c.json({ error: 'not_found' }, 404);
      const id = unitId(p.data.course, p.data.unit);
      const unit = await deps.content.get(id);
      if (!unit) return c.json({ error: 'not_found' }, 404);
      const drafts = new Map(
        (await deps.drafts.list(id, p.data.language)).map((d) => [d.wordId, d])
      );
      const actor = c.get('actor').id;
      const words: WordWithDraft[] = unit.draft.vokabeln.map((word) => {
        const draft = drafts.get(word.id);
        return {
          wordId: word.id,
          ar: word.ar,
          de: word.de,
          draft: draft
            ? {
                id: draft.id,
                text: draft.text,
                status: draft.status,
                model: draft.model,
                reviewedAt: draft.reviewedAt,
                stale: draft.sourceDe !== word.de,
                own: draft.draftedBy === actor,
              }
            : null,
        };
      });
      return c.json({ words });
    }
  );

  app.post(
    '/content/units/:course/:unit/meanings/:language/draft',
    guard('content:write'),
    async (c) => {
      const p = Params.safeParse(c.req.param());
      if (!p.success) return c.json({ error: 'not_found' }, 404);
      if (!deps.gateway) return c.json({ error: 'ai_unavailable' }, 503);
      const result = await draftMeanings(
        { content: deps.content, drafts: deps.drafts, gateway: deps.gateway },
        actorOf(c),
        unitId(p.data.course, p.data.unit),
        p.data.language
      );
      if (result.ok) {
        return c.json({ drafted: result.drafted, remaining: result.remaining });
      }
      const status = {
        not_found: 404,
        nothing_to_translate: 409,
        ai_unavailable: 503,
        ai_quota: 429,
        ai_failed: 502,
      } as const;
      return c.json({ error: result.reason }, status[result.reason]);
    }
  );

  app.post(
    '/content/meaning-drafts/:id/review',
    small,
    guard('content:review'),
    async (c) => {
      const id = z.string().uuid().safeParse(c.req.param('id'));
      if (!id.success) return c.json({ error: 'not_found' }, 404);
      const body = ReviewBody.safeParse(await c.req.json().catch(() => null));
      if (!body.success) return c.json({ error: 'invalid_body' }, 400);
      const result = await deps.drafts.review(id.data, actorOf(c), body.data);
      if (result.ok) {
        const { draft } = result;
        return c.json({
          draft: { id: draft.id, text: draft.text, status: draft.status },
        });
      }
      const status = {
        not_found: 404,
        own_draft: 403,
        draft_changed: 409,
        source_changed: 409,
      } as const;
      return c.json({ error: result.reason }, status[result.reason]);
    }
  );

  app.post('/content/meanings/publish', guard('content:write'), async (c) =>
    c.json({ version: await deps.content.ensureBundle(actorOf(c)) })
  );

  return app;
}
