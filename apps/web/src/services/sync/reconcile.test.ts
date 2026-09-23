import { describe, it, expect } from 'vitest';
import { decide, mergeRecords, type Reconcilable } from './reconcile';

function rec(id: string, updated_at: string, deleted = false): Reconcilable {
  return { id, updated_at, deleted };
}

const T1 = '2026-06-10T08:00:00.000Z';
const T2 = '2026-06-12T08:00:00.000Z';
const T3 = '2026-06-13T08:00:00.000Z';

describe('Sync reconciliation: decide (last-write-wins)', () => {
  it('only local present → keep-local', () => {
    expect(decide(rec('a', T1), undefined)).toBe('keep-local');
  });

  it('only remote present → take-remote', () => {
    expect(decide(undefined, rec('a', T1))).toBe('take-remote');
  });

  it('newer remote timestamp wins', () => {
    expect(decide(rec('a', T1), rec('a', T2))).toBe('take-remote');
  });

  it('newer local timestamp wins', () => {
    expect(decide(rec('a', T3), rec('a', T2))).toBe('keep-local');
  });

  it('same timestamp → equal', () => {
    expect(decide(rec('a', T2), rec('a', T2))).toBe('equal');
  });

  it('invalid local timestamp → take-remote', () => {
    expect(decide(rec('a', 'nonsense'), rec('a', T2))).toBe('take-remote');
  });

  it('both invalid → equal', () => {
    expect(decide(rec('a', 'x'), rec('a', 'y'))).toBe('equal');
  });
});

describe('Sync reconciliation: soft-delete semantics', () => {
  it('newer deletion overrides older edit', () => {
    const local = rec('a', T1, false);
    const remoteDeleted = rec('a', T2, true);
    expect(decide(local, remoteDeleted)).toBe('take-remote');
  });

  it('newer edit overrides older deletion', () => {
    const localDeleted = rec('a', T1, true);
    const remoteEdit = rec('a', T2, false);
    const result = mergeRecords([localDeleted], [remoteEdit]);
    expect(result.merged[0]!.deleted).toBe(false);
    expect(result.toWriteLocal).toHaveLength(1);
  });
});

describe('Sync reconciliation: mergeRecords', () => {
  it('unites disjoint local and remote sets', () => {
    const result = mergeRecords([rec('a', T1)], [rec('b', T1)]);
    expect(result.merged.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('local-only records end up in toPushRemote', () => {
    const result = mergeRecords([rec('a', T1)], []);
    expect(result.toPushRemote.map((r) => r.id)).toEqual(['a']);
    expect(result.toWriteLocal).toHaveLength(0);
  });

  it('remote-only records end up in toWriteLocal', () => {
    const result = mergeRecords([], [rec('a', T1)]);
    expect(result.toWriteLocal.map((r) => r.id)).toEqual(['a']);
    expect(result.toPushRemote).toHaveLength(0);
  });

  it('on conflict the newer one wins and is written locally', () => {
    const result = mergeRecords([rec('a', T1)], [rec('a', T3)]);
    expect(result.merged).toHaveLength(1);
    expect(result.merged[0]!.updated_at).toBe(T3);
    expect(result.toWriteLocal.map((r) => r.id)).toEqual(['a']);
    expect(result.toPushRemote).toHaveLength(0);
  });

  it('equal records are neither written nor pushed', () => {
    const result = mergeRecords([rec('a', T2)], [rec('a', T2)]);
    expect(result.toWriteLocal).toHaveLength(0);
    expect(result.toPushRemote).toHaveLength(0);
    expect(result.merged).toHaveLength(1);
  });

  it('idempotence: merging twice changes nothing further', () => {
    const first = mergeRecords([rec('a', T1)], [rec('a', T3)]);
    const second = mergeRecords(first.merged, [rec('a', T3)]);
    expect(second.toWriteLocal).toHaveLength(0);
    expect(second.toPushRemote).toHaveLength(0);
  });
});
