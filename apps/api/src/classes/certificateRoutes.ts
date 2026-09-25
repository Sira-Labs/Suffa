/**
 * Unit certificates (story 14.3), mounted at /api/v1:
 *
 *   GET    /classes/:id/certificates                  → eligible learners, awarded (class:manage)
 *   POST   /classes/:id/certificates { userId, unit } → 201 certificate            (class:manage)
 *   DELETE /classes/:id/certificates/:certificateId   → 204                        (class:manage)
 *   GET    /certificates                              → the caller's own          (profile:read)
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv, type AuthorizeLog } from '../authz/middleware.js';
import type { Actor as PolicyActor } from '../authz/policies.js';
import type { CertificateRepository } from './certificates.js';
import type { ClassRepository } from './repository.js';

export interface CertificateRouteDeps {
  classes: Pick<ClassRepository, 'scope'>;
  certificates: CertificateRepository;
  auth: AuthResolver;
  log: AuthorizeLog;
}

const Uuid = z.string().uuid();
const AwardBody = z
  .object({ userId: z.string().uuid(), unit: z.number().int().min(1).max(99) })
  .strict();

const STATUS = {
  not_a_learner: 404,
  unknown_unit: 400,
  not_eligible: 409,
  exists: 409,
} as const;

export function createCertificateRoutes(deps: CertificateRouteDeps): Hono<ActorEnv> {
  const app = new Hono<ActorEnv>();
  const classScope = async (c: Context, actor: PolicyActor) => {
    const id = Uuid.safeParse(c.req.param('id'));
    return id.success ? deps.classes.scope(id.data, actor.id) : { classRole: null };
  };
  const manage = authorize(deps.auth, 'class:manage', deps.log, classScope);
  const own = authorize(deps.auth, 'profile:read', deps.log);
  const actorOf = (c: Context<ActorEnv>) => ({
    id: c.get('actor').id,
    ip: c.req.header('x-real-ip') ?? null,
  });

  app.get('/classes/:id/certificates', manage, async (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json(await deps.certificates.forClass(c.req.param('id')));
  });

  app.post('/classes/:id/certificates', manage, async (c) => {
    const parsed = AwardBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const result = await deps.certificates.award(
      actorOf(c),
      c.req.param('id'),
      parsed.data.userId,
      parsed.data.unit
    );
    if (!result.ok) return c.json({ error: result.reason }, STATUS[result.reason]);
    return c.json(result.certificate, 201);
  });

  app.delete('/classes/:id/certificates/:certificateId', manage, async (c) => {
    const certificateId = Uuid.safeParse(c.req.param('certificateId'));
    if (!certificateId.success) return c.json({ error: 'not_found' }, 404);
    const done = await deps.certificates.revoke(
      actorOf(c),
      c.req.param('id'),
      certificateId.data
    );
    return done ? c.body(null, 204) : c.json({ error: 'not_found' }, 404);
  });

  app.get('/certificates', own, async (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({ certificates: await deps.certificates.mine(c.get('actor').id) });
  });

  return app;
}
