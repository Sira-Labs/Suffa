import { describe, expect, it } from 'vitest';
import { ACTIONS, can, ROLES, type Action, type Role } from '../src/authz/policies.js';

/**
 * The expected matrix, written out by hand on purpose: a change to RBAC_MATRIX must be made
 * here as well, so widening a permission is always a visible, reviewed decision.
 */
const EXPECTED: Record<Action, readonly Role[]> = {
  'profile:read': ['student', 'teacher', 'admin'],
  'sync:own': ['student', 'teacher', 'admin'],
  'class:create': ['teacher', 'admin'],
  'class:progress:read': ['admin'], // without a class scope only admins
  'admin:users:read': ['admin'],
  'admin:users:write': ['admin'],
};

describe('authz policies', () => {
  it('covers every action in the expected matrix', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...ACTIONS].sort());
  });

  for (const action of ACTIONS) {
    for (const role of ROLES) {
      const allowed = EXPECTED[action].includes(role);
      it(`${role} ${allowed ? 'may' : 'may not'} ${action}`, () => {
        expect(can({ id: 'u', role }, action)).toBe(allowed);
      });
    }
  }

  it('denies everything to anonymous callers', () => {
    for (const action of ACTIONS) expect(can(null, action)).toBe(false);
  });

  it('lets teachers read progress only of classes they teach', () => {
    const teacher = { id: 't', role: 'teacher' } as const;
    expect(can(teacher, 'class:progress:read', { classRole: 'teacher' })).toBe(true);
    expect(can(teacher, 'class:progress:read', { classRole: 'student' })).toBe(false);
    expect(can(teacher, 'class:progress:read', { classRole: null })).toBe(false);
  });

  it('never lets a student read class progress, even as a class teacher', () => {
    // Platform role gates the capability first; a stale class row cannot widen it.
    const student = { id: 's', role: 'student' } as const;
    expect(can(student, 'class:progress:read', { classRole: 'teacher' })).toBe(false);
  });
});
