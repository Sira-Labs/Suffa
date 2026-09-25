/**
 * Class dashboard and class spirit, mounted at /api/v1 (stories 6.1, 6.2):
 *
 *   GET    /classes/:id/progress                     → dashboard      (class:progress:read)
 *   GET    /classes/:id/feed                         → challenge, shout-outs, badges (class:read)
 *   PUT    /classes/:id/challenge   { template, target, timeZone } → this week's challenge
 *   DELETE /classes/:id/challenge                    → 204            (class:manage)
 *   POST   /classes/:id/badges      { name, icon, message }         (class:manage)
 *   POST   /classes/:id/badges/:badgeId/awards { userId } → 204     (class:manage)
 *   POST   /classes/:id/shoutouts   { message, userId? }            (class:manage)
 *   DELETE /classes/:id/shoutouts/:shoutoutId        → 204            (class:manage)
 *   GET    /classes/:id/league                       → podium and own week  (class:read)
 *   PUT    /classes/:id/league/opt-in  { optIn }     → 204 (learners only)  (class:read)
 *   GET    /classes/:id/league/settings              → { enabled, minors }  (class:manage)
 *   PUT    /classes/:id/league/settings { enabled, minors } → 204          (class:manage)
 *
 * Every route is scoped by the caller's role in that class, read from the database.
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { isTimeZone } from '@suffa/engagement';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv, type AuthorizeLog } from '../authz/middleware.js';
import type { Actor as PolicyActor } from '../authz/policies.js';
import type { ClassLeagueRepository } from './league.js';
import type { ClassProgressRepository } from './progress.js';
import type { ClassRepository } from './repository.js';
import {
  BADGE_ICONS,
  CHALLENGE_TEMPLATES,
  type ClassSpiritRepository,
} from './spirit.js';

export interface ClassSpiritRouteDeps {
  classes: Pick<ClassRepository, 'scope'>;
  progress: ClassProgressRepository;
  spirit: ClassSpiritRepository;
  league: ClassLeagueRepository;
  auth: AuthResolver;
  log: AuthorizeLog;
}

const Uuid = z.string().uuid();
const ChallengeBody = z
  .object({
    template: z.enum(CHALLENGE_TEMPLATES),
    target: z.number().int().min(1).max(100_000),
    timeZone: z.string().max(64).refine(isTimeZone, 'unknown time zone'),
  })
  .strict();
const BadgeBody = z
  .object({
    name: z.string().trim().min(1).max(40),
    icon: z.enum(BADGE_ICONS),
    message: z.string().trim().max(200).default(''),
  })
  .strict();
const AwardBody = z.object({ userId: z.string().uuid() }).strict();
const ShoutoutBody = z
  .object({
    message: z.string().trim().min(1).max(280),
    userId: z.string().uuid().nullish(),
  })
  .strict();

const OptInBody = z.object({ optIn: z.boolean() }).strict();
const LeagueSettingsBody = z
  .object({ enabled: z.boolean(), minors: z.boolean() })
  .strict();

const clientIp = (c: Context) => c.req.header('x-real-ip') ?? null;

export function createClassSpiritRoutes(deps: ClassSpiritRouteDeps): Hono<ActorEnv> {
  const app = new Hono<ActorEnv>();
  const classScope = async (c: Context, actor: PolicyActor) => {
    const id = Uuid.safeParse(c.req.param('id'));
    return id.success ? deps.classes.scope(id.data, actor.id) : { classRole: null };
  };
  const manage = authorize(deps.auth, 'class:manage', deps.log, classScope);
  const read = authorize(deps.auth, 'class:read', deps.log, classScope);
  const progress = authorize(deps.auth, 'class:progress:read', deps.log, classScope);
  const actorOf = (c: Context<ActorEnv>) => ({ id: c.get('actor').id, ip: clientIp(c) });

  app.get('/classes/:id/progress', progress, async (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json(await deps.progress.progress(c.req.param('id')));
  });

  app.get('/classes/:id/feed', read, async (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json(await deps.spirit.feed(c.req.param('id'), c.get('actor').id));
  });

  app.put('/classes/:id/challenge', manage, async (c) => {
    const parsed = ChallengeBody.safeParse(await readJson(c));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    return c.json(
      await deps.spirit.setChallenge(actorOf(c), c.req.param('id'), parsed.data)
    );
  });

  app.delete('/classes/:id/challenge', manage, async (c) => {
    const done = await deps.spirit.removeChallenge(actorOf(c), c.req.param('id'));
    return done ? c.body(null, 204) : c.json({ error: 'not_found' }, 404);
  });

  app.post('/classes/:id/badges', manage, async (c) => {
    const parsed = BadgeBody.safeParse(await readJson(c));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    return c.json(
      await deps.spirit.createBadge(actorOf(c), c.req.param('id'), parsed.data),
      201
    );
  });

  app.post('/classes/:id/badges/:badgeId/awards', manage, async (c) => {
    const badgeId = Uuid.safeParse(c.req.param('badgeId'));
    const parsed = AwardBody.safeParse(await readJson(c));
    if (!badgeId.success || !parsed.success)
      return c.json({ error: 'invalid_body' }, 400);
    const done = await deps.spirit.award(
      actorOf(c),
      c.req.param('id'),
      badgeId.data,
      parsed.data.userId
    );
    return done ? c.body(null, 204) : c.json({ error: 'not_found' }, 404);
  });

  app.post('/classes/:id/shoutouts', manage, async (c) => {
    const parsed = ShoutoutBody.safeParse(await readJson(c));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const shout = await deps.spirit.shoutout(actorOf(c), c.req.param('id'), {
      message: parsed.data.message,
      userId: parsed.data.userId ?? null,
    });
    return shout ? c.json(shout, 201) : c.json({ error: 'not_found' }, 404);
  });

  app.delete('/classes/:id/shoutouts/:shoutoutId', manage, async (c) => {
    const shoutoutId = Uuid.safeParse(c.req.param('shoutoutId'));
    if (!shoutoutId.success) return c.json({ error: 'not_found' }, 404);
    const done = await deps.spirit.removeShoutout(
      actorOf(c),
      c.req.param('id'),
      shoutoutId.data
    );
    return done ? c.body(null, 204) : c.json({ error: 'not_found' }, 404);
  });

  app.get('/classes/:id/league', read, async (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json(await deps.league.view(c.req.param('id'), c.get('actor').id));
  });

  app.put('/classes/:id/league/opt-in', read, async (c) => {
    const parsed = OptInBody.safeParse(await readJson(c));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const done = await deps.league.setOptIn(
      c.req.param('id'),
      c.get('actor').id,
      parsed.data.optIn
    );
    return done ? c.body(null, 204) : c.json({ error: 'not_a_learner' }, 409);
  });

  app.get('/classes/:id/league/settings', manage, async (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json(await deps.league.settings(c.req.param('id')));
  });

  app.put('/classes/:id/league/settings', manage, async (c) => {
    const parsed = LeagueSettingsBody.safeParse(await readJson(c));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    await deps.league.updateSettings(actorOf(c), c.req.param('id'), parsed.data);
    return c.body(null, 204);
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
