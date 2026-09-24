# ADR-0009: Role-based access control — platform roles + class roles

- Status: accepted (policies and middleware since story 3.2; admin area, second factor and classes since Sprint 4)
- Date: 2026-09-23

## Context

Three kinds of users: **admin**, **teacher**, **student**. A person may teach one class and
learn in another. Teachers must see progress of _their_ students only. Today's security model is
RLS `user_id = auth.uid()`.

## Decision

- **Platform role** on `users.role ∈ {student, teacher, admin}` — controls _capabilities_
  (e.g. only `teacher`/`admin` can create classes; only `admin` reaches `/admin`).
- **Class role** on `class_members.class_role ∈ {teacher, student}` — controls _data scope_.
- Authorisation is a set of pure **policy functions** in `apps/api/src/authz/`
  (`can(actor, action, resource)`), invoked by route middleware; no inline checks in handlers.
- Teachers read aggregated progress (`review_logs`, `srs_cards`, `exam_results`,
  `video_progress`) only for members of classes where they are `class_role = teacher`.
  Students can see who teaches them, not other students' data (leaderboards are opt-in and
  expose only display name + score).
- Every privileged mutation writes to `audit_log`.
- Defence in depth: the API connects with a DB role that has no `DROP/ALTER`; optional
  Postgres RLS using `SET LOCAL app.user_id` can be added later without API changes.

## Alternatives

- Casbin/OPA policy engines: powerful, overkill for ~20 rules.
- Pure RLS (as today): works for "own data", awkward for teacher-scoped aggregates and admin.

## Consequences

A single RBAC matrix (actions × roles) documented in code and covered by a table-driven
integration test that runs every route against every role.

## Implementation (story 3.2)

- `apps/api/src/authz/policies.ts`: `RBAC_MATRIX` (action → roles) and `can(actor, action, scope)`.
  Class-scoped actions need the platform role **and** the class role (`class:progress:read`:
  admin, or teacher of that class); a missing scope is denied.
- `apps/api/src/authz/middleware.ts`: `authorize(resolver, action)` answers 401 without a
  session, 403 without permission (logged as `authz.denied`), and puts the actor on the context.
- `apps/api/src/authz/routes.ts`: every route with its action, plus the public routes. The
  matrix test (`test/authz.matrix.test.ts`) compares this list with the routes the app
  registers and runs each protected route against anonymous, student, teacher and admin.
- The role is read from `users` on every request (no role in the cookie), so a change applies
  at once. Unknown values in the database fall back to `student`.
- Dev tokens (outside prod only) always act as students.

## Implementation (Sprint 4)

- **Admin area (4.2):** role changes and disabling go through `PATCH /api/v1/admin/users/:id`
  and are written to `audit_log` in the same transaction. Disabling ends all sessions; a
  disabled user has no working session. Admins cannot change themselves.
- **Second factor:** actions in `SECOND_FACTOR_ACTIONS` (all `admin:*`) need a session that
  confirmed a TOTP code within 12 hours (`sessions.second_factor_at`). The secret is sealed
  with AES-256-GCM, key derived from `SUFFA_AUTH_SECRET` (rotating it means re-enrolling).
- **Classes (4.3):** `class:manage` is scoped; `authorize()` takes a scope loader that reads
  the caller's class role from `class_members` (only `status = 'active'`). Invite tokens are
  random (192 bit), stored as SHA-256, valid 14 days, one per class.
- **GDPR (4.4):** export of everything stored about a user; deletion cascades through the
  foreign keys, archives classes the user taught alone, and leaves an actor-less audit entry.
