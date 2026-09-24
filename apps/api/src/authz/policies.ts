/**
 * Authorisation policies (ADR-0009). Pure functions, no I/O: routes declare the action they
 * need, the middleware asks `can()`, and a table-driven test runs every route against every
 * role. There are no inline role checks in handlers.
 *
 * Two layers:
 * - Platform role (`users.role`) decides capabilities: who may create classes, who reaches
 *   the admin area.
 * - Class role (`class_members.class_role`, Sprint 4) decides data scope: a teacher sees
 *   progress only of classes they teach. Scoped actions take that relation as the resource.
 */

export const ROLES = ['student', 'teacher', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** The signed-in person as the policies see them. */
export interface Actor {
  id: string;
  role: Role;
  /** This session confirmed the second factor recently (see SECOND_FACTOR_TTL_MS). */
  secondFactor?: boolean;
}

/** How the actor relates to a class (loaded by the route, never sent by the client). */
export interface ClassScope {
  classRole: 'teacher' | 'student' | null;
}

/**
 * Capability matrix: action → platform roles allowed. The single source of truth; the matrix
 * test and the docs read it from here.
 */
export const RBAC_MATRIX = {
  /** Read one's own account (/me). */
  'profile:read': ['student', 'teacher', 'admin'],
  /** Change one's own settings and end one's own sessions. */
  'profile:write': ['student', 'teacher', 'admin'],
  /** Push and pull one's own learning data. */
  'sync:own': ['student', 'teacher', 'admin'],
  /** Create a class. */
  'class:create': ['teacher', 'admin'],
  /** Invite, approve and remove members; additionally scoped: teacher of that class. */
  'class:manage': ['teacher', 'admin'],
  /** See one's classes and join one with an invite. */
  'class:join': ['student', 'teacher', 'admin'],
  /** Read aggregated progress of a class; additionally scoped by class role. */
  'class:progress:read': ['teacher', 'admin'],
  /** List and search users in the admin area. */
  'admin:users:read': ['admin'],
  /** Change a user's role or disable them (audit-logged). */
  'admin:users:write': ['admin'],
  /** Read the audit log. */
  'admin:audit:read': ['admin'],
} as const satisfies Record<string, readonly Role[]>;

export type Action = keyof typeof RBAC_MATRIX;
export const ACTIONS = Object.keys(RBAC_MATRIX) as Action[];

/**
 * Actions that also need a confirmed second factor in this session (ADR-0009: admin 2FA).
 * A stolen session cookie or mailbox alone cannot reach the admin area.
 */
export const SECOND_FACTOR_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  'admin:users:read',
  'admin:users:write',
  'admin:audit:read',
]);

/** Allowed by role, but the session still has to confirm the second factor. */
export function needsSecondFactor(actor: Actor, action: Action): boolean {
  return SECOND_FACTOR_ACTIONS.has(action) && actor.secondFactor !== true;
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/**
 * May `actor` perform `action`? Anonymous actors may do nothing here (public routes carry no
 * action). Scoped actions without their scope are denied: failing closed beats guessing.
 */
export function can(actor: Actor | null, action: Action, scope?: ClassScope): boolean {
  if (!actor) return false;
  const allowed: readonly Role[] = RBAC_MATRIX[action];
  if (!allowed.includes(actor.role)) return false;
  switch (action) {
    case 'class:progress:read':
    case 'class:manage':
      // Admins oversee every class; teachers only classes they teach.
      return actor.role === 'admin' || scope?.classRole === 'teacher';
    default:
      return true;
  }
}
