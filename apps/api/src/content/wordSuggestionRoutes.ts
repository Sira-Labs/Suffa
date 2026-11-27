/**
 * Words for Muslims in Europe (story 18.4, ADR-0034), mounted at /api/v1:
 *
 *   GET  /content/units/:course/:unit/word-suggestions          → { suggestions }
 *                                                                               (content:review)
 *   POST /content/units/:course/:unit/word-suggestions/draft    → { suggested }
 *                                                                               (content:write)
 *   POST /content/word-suggestions/:id/decide { decision, word? } → { suggestion }
 *                                                                               (content:review)
 *
 * An admin has the LLM suggest words a unit lacks; a teacher accepts each one, as suggested
 * or corrected, or rejects it, and never one they ordered themselves (403 `own_suggestion`).
 * An accepted word becomes part of the unit's draft (its next revision); a suggestion that is
 * not accepted never leaves its table.
 */
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv, type AuthorizeLog } from '../authz/middleware.js';
import type { Action } from '../authz/policies.js';
import type { AiGateway } from '../ai/gateway.js';
import { unitId, type ContentActor } from './repository.js';
import {
  decideSuggestion,
  SuggestedWordSchema,
  suggestWords,
  type WordSuggestion,
  type WordSuggestionDeps,
} from './wordSuggestions.js';

export interface WordSuggestionRouteDeps extends WordSuggestionDeps {
  /** Without the LLM gateway the draft route answers 503. */
  gateway?: Pick<AiGateway, 'complete'>;
  auth: AuthResolver;
  log: AuthorizeLog;
}

const Params = z.object({
  course: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  unit: z.coerce.number().int().min(1).max(999),
});

const DecideBody = z.discriminatedUnion('decision', [
  z
    .object({
      decision: z.literal('accepted'),
      // The reviewer's corrections; fields left out stay as suggested.
      word: SuggestedWordSchema.partial().strict().optional(),
    })
    .strict(),
  z.object({ decision: z.literal('rejected') }).strict(),
]);

export function createWordSuggestionRoutes(
  deps: WordSuggestionRouteDeps
): Hono<ActorEnv> {
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
  /** What a reviewer sees of a suggestion; `own`: they ordered it, someone else decides. */
  const view = (s: WordSuggestion, actor: string) => ({
    id: s.id,
    ar: s.ar,
    tr: s.tr,
    de: s.de,
    wurzel: s.wurzel,
    plural: s.plural,
    reason: s.reason,
    model: s.model,
    status: s.status,
    decidedAt: s.decidedAt,
    wordId: s.wordId,
    own: s.suggestedBy === actor,
  });

  app.get(
    '/content/units/:course/:unit/word-suggestions',
    guard('content:review'),
    async (c) => {
      const p = Params.safeParse(c.req.param());
      if (!p.success) return c.json({ error: 'not_found' }, 404);
      const id = unitId(p.data.course, p.data.unit);
      if (!(await deps.content.get(id))) return c.json({ error: 'not_found' }, 404);
      const actor = c.get('actor').id;
      const suggestions = (await deps.suggestions.list(id)).map((s) => view(s, actor));
      return c.json({ suggestions });
    }
  );

  app.post(
    '/content/units/:course/:unit/word-suggestions/draft',
    guard('content:write'),
    async (c) => {
      const p = Params.safeParse(c.req.param());
      if (!p.success) return c.json({ error: 'not_found' }, 404);
      if (!deps.gateway) return c.json({ error: 'ai_unavailable' }, 503);
      const result = await suggestWords(
        { ...deps, gateway: deps.gateway },
        actorOf(c),
        unitId(p.data.course, p.data.unit)
      );
      if (result.ok) return c.json({ suggested: result.suggested });
      const status = {
        not_found: 404,
        decide_first: 409,
        nothing_new: 409,
        ai_unavailable: 503,
        ai_quota: 429,
        ai_failed: 502,
      } as const;
      return c.json({ error: result.reason }, status[result.reason]);
    }
  );

  app.post(
    '/content/word-suggestions/:id/decide',
    small,
    guard('content:review'),
    async (c) => {
      const id = z.string().uuid().safeParse(c.req.param('id'));
      if (!id.success) return c.json({ error: 'not_found' }, 404);
      const body = DecideBody.safeParse(await c.req.json().catch(() => null));
      if (!body.success) return c.json({ error: 'invalid_body' }, 400);
      const actor = actorOf(c);
      const result = await decideSuggestion(deps, actor, id.data, body.data);
      if (result.ok) return c.json({ suggestion: view(result.suggestion, actor.id) });
      if (result.reason === 'invalid_word') {
        return c.json({ error: 'invalid_word', issues: result.issues }, 400);
      }
      const status = {
        not_found: 404,
        own_suggestion: 403,
        already_decided: 409,
        duplicate_word: 409,
        unit_changed: 409,
      } as const;
      return c.json({ error: result.reason }, status[result.reason]);
    }
  );

  return app;
}
