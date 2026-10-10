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
  /** Read a class's feed (challenge, shout-outs, badges); scoped: active member of it. */
  'class:read': ['student', 'teacher', 'admin'],
  /** Read aggregated progress of a class; additionally scoped by class role. */
  'class:progress:read': ['teacher', 'admin'],
  /** Talk to al-Muʿallim; every learner reaches only their own conversations. */
  'tutor:use': ['student', 'teacher', 'admin'],
  'speech:assess': ['student', 'teacher', 'admin'],
  /** Share one's own recordings with a class's teachers, see and withdraw them. */
  'recording:share': ['student', 'teacher', 'admin'],
  /**
   * Hear and comment on what a class's learners shared; scoped: teacher of that class.
   * Admins do not get in: learners shared with their teacher, nobody else (story 15.4).
   */
  'class:recordings:listen': ['teacher', 'admin'],
  /** List and search users in the admin area. */
  'admin:users:read': ['admin'],
  /** Change a user's role or disable them (audit-logged). */
  'admin:users:write': ['admin'],
  /** Read the audit log. */
  'admin:audit:read': ['admin'],
  /** See AI routes, budget and spend. */
  'admin:ai:read': ['admin'],
  /** Change AI routes, budget and quotas; try a route (audit-logged, costs money). */
  'admin:ai:write': ['admin'],
  /** Manage the video catalog: channels, permission, import, units, checkpoints. */
  'admin:videos': ['admin'],
  /** Read testers' feedback and mark it done. */
  'admin:feedback': ['admin'],
  /**
   * Read the course units in the CMS, mark one under review as checked or send it back
   * (story 16.1): the teachers check the content, the admins edit and publish it.
   */
  'content:review': ['teacher', 'admin'],
  /** Edit unit drafts, submit them for review and publish them (audit-logged). */
  'content:write': ['admin'],
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
  'admin:ai:read',
  'admin:ai:write',
  'admin:videos',
  'admin:feedback',
  'content:write',
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
    case 'class:recordings:listen':
      return scope?.classRole === 'teacher';
    case 'class:read':
      // Any active member of the class (pending learners wait for approval first).
      return actor.role === 'admin' || (scope?.classRole ?? null) !== null;
    default:
      return true;
  }
}
