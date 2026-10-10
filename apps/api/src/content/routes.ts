/**
 * The content CMS (story 16.1, ADR-0014), mounted at /api/v1:
 *
 *   GET  /content/units                               → { units }            (content:review)
 *   GET  /content/units/:course/:unit                 → UnitDetail           (content:review)
 *   PUT  /content/units/:course/:unit/draft   { revision, content } → { revision } (content:write)
 *   POST /content/units/:course/:unit/submit  { revision }        → { revision } (content:write)
 *   POST /content/units/:course/:unit/check   { revision }        → { revision } (content:review)
 *   POST /content/units/:course/:unit/return  { revision, note }  → { revision } (content:review)
 *   POST /content/units/:course/:unit/publish { revision }        → { revision } (content:write)
 *
 * Teachers read and check, admins (with the second factor) edit and publish. Every change
 * carries the revision it was made on: 409 `stale_revision` when someone else was faster,
 * 409 `wrong_state` when the unit is not in a state that allows the step.
 */
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv, type AuthorizeLog } from '../authz/middleware.js';
import type { Action } from '../authz/policies.js';
import {
  unitId,
  type ContentActor,
  type ContentRepository,
  type SaveResult,
} from './repository.js';
import { validateUnitContent } from './schema.js';

export interface ContentRouteDeps {
  repo: ContentRepository;
  auth: AuthResolver;
  log: AuthorizeLog;
}

/** A unit with 300 words, 20 dialogues and 40 grammar points stays well below this. */
const MAX_DRAFT_BYTES = 1024 * 1024;
const MAX_STEP_BYTES = 8 * 1024;

const UnitParams = z.object({
  course: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  unit: z.coerce.number().int().min(1).max(999),
});

const Revision = z.number().int().positive();
const DraftBody = z
  .object({ revision: Revision, content: z.record(z.string(), z.unknown()) })
  .strict();
const StepBody = z.object({ revision: Revision }).strict();
const ReturnBody = z
  .object({ revision: Revision, note: z.string().trim().min(1).max(2000) })
  .strict();

/** The JSON body, or undefined when it is not JSON (answered with 400 by the schema). */
async function jsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

function limit(maxSize: number) {
  return bodyLimit({
    maxSize,
    onError: (c) => c.json({ error: 'payload_too_large' }, 413),
  });
}

function answer(c: Context, result: SaveResult) {
  if (result.ok) return c.json({ revision: result.revision });
  switch (result.reason) {
    case 'not_found':
      return c.json({ error: 'not_found' }, 404);
    case 'stale_revision':
    case 'wrong_state':
      return c.json({ error: result.reason }, 409);
    case 'id_taken':
      return c.json({ error: 'id_taken', issues: result.issues }, 422);
  }
}

export function createContentRoutes(deps: ContentRouteDeps): Hono<ActorEnv> {
  const app = new Hono<ActorEnv>();
  const guard = (action: Action) => authorize(deps.auth, action, deps.log);
  const actorOf = (c: Context<ActorEnv>): ContentActor => ({
    id: c.get('actor').id,
    ipAddress: c.req.header('x-real-ip') ?? null,
  });
  const params = (c: Context) => UnitParams.safeParse(c.req.param());

  app.get('/content/units', guard('content:review'), async (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({ units: await deps.repo.list() });
  });

  app.get('/content/units/:course/:unit', guard('content:review'), async (c) => {
    const p = params(c);
    if (!p.success) return c.json({ error: 'not_found' }, 404);
    const unit = await deps.repo.get(unitId(p.data.course, p.data.unit));
    c.header('Cache-Control', 'no-store');
    return unit ? c.json(unit) : c.json({ error: 'not_found' }, 404);
  });

  app.put(
    '/content/units/:course/:unit/draft',
    limit(MAX_DRAFT_BYTES),
    guard('content:write'),
    async (c) => {
      const p = params(c);
      if (!p.success) return c.json({ error: 'not_found' }, 404);
      const body = DraftBody.safeParse(await jsonBody(c));
      if (!body.success) return c.json({ error: 'invalid_body' }, 400);
      const checked = validateUnitContent(p.data.unit, body.data.content);
      if (!checked.ok)
        return c.json({ error: 'invalid_content', issues: checked.issues }, 422);
      return answer(
        c,
        await deps.repo.saveDraft(
          unitId(p.data.course, p.data.unit),
          actorOf(c),
          body.data.revision,
          checked.content
        )
      );
    }
  );

  // Submit, check and publish only name the revision they act on.
  const steps = [
    ['submit', 'content:write'],
    ['check', 'content:review'],
    ['publish', 'content:write'],
  ] as const;
  for (const [step, action] of steps) {
    app.post(
      `/content/units/:course/:unit/${step}`,
      limit(MAX_STEP_BYTES),
      guard(action),
      async (c) => {
        const p = params(c);
        if (!p.success) return c.json({ error: 'not_found' }, 404);
        const body = StepBody.safeParse(await jsonBody(c));
        if (!body.success) return c.json({ error: 'invalid_body' }, 400);
        const id = unitId(p.data.course, p.data.unit);
        const actor = actorOf(c);
        const result =
          step === 'submit'
            ? await deps.repo.submit(id, actor, body.data.revision)
            : step === 'check'
              ? await deps.repo.check(id, actor, body.data.revision)
              : await deps.repo.publish(id, actor, body.data.revision);
        return answer(c, result);
      }
    );
  }

  app.post(
    '/content/units/:course/:unit/return',
    limit(MAX_STEP_BYTES),
    guard('content:review'),
    async (c) => {
      const p = params(c);
      if (!p.success) return c.json({ error: 'not_found' }, 404);
      const body = ReturnBody.safeParse(await jsonBody(c));
      if (!body.success) return c.json({ error: 'invalid_body' }, 400);
      return answer(
        c,
        await deps.repo.returnToDraft(
          unitId(p.data.course, p.data.unit),
          actorOf(c),
          body.data.revision,
          body.data.note
        )
      );
    }
  );

  return app;
}
