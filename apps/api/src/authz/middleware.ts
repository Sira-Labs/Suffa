/**
 * Route middleware for the policies (ADR-0009): every protected route names its action once,
 * `authorize()` answers 401 (not signed in) or 403 (signed in, not allowed) before the handler
 * runs, and the handler reads the actor from the context.
 */
import type { Context, MiddlewareHandler } from 'hono';
import {
  can,
  needsSecondFactor,
  type Action,
  type Actor,
  type ClassScope,
} from './policies.js';

export type ActorEnv<A extends Actor = Actor> = { Variables: { actor: A } };

export interface AuthorizeLog {
  warn(obj: object, msg: string): void;
}

/** Any AuthResolver; it may return more than id and role (e.g. the profile for /me). */
export type ActorSource<A extends Actor> = {
  actor(headers: Headers): Promise<A | null>;
};

/**
 * For scoped actions: how the actor relates to the resource the request names (e.g. the
 * class in the path), loaded from the database – never taken from the client.
 */
export type ScopeLoader<A extends Actor> = (c: Context, actor: A) => Promise<ClassScope>;

export function authorize<A extends Actor = Actor>(
  resolver: ActorSource<A>,
  action: Action,
  log?: AuthorizeLog,
  loadScope?: ScopeLoader<A>
): MiddlewareHandler<ActorEnv<A>> {
  return async (c, next) => {
    const actor = await resolver.actor(c.req.raw.headers);
    if (!actor) return c.json({ error: 'unauthorized' }, 401);
    const scope = loadScope ? await loadScope(c, actor) : undefined;
    if (!can(actor, action, scope)) {
      log?.warn(
        { action, userId: actor.id, role: actor.role, path: c.req.path },
        'authz.denied'
      );
      return c.json({ error: 'forbidden' }, 403);
    }
    if (needsSecondFactor(actor, action)) {
      return c.json({ error: 'second_factor_required' }, 403);
    }
    c.set('actor', actor);
    await next();
  };
}
