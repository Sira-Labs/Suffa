import { describe, it, expect } from 'vitest';
import { decide, mergeRecords, type Reconcilable } from './reconcile';

function rec(id: string, updated_at: string, deleted = false): Reconcilable {
  return { id, updated_at, deleted };
}

const T1 = '2026-06-10T08:00:00.000Z';
const T2 = '2026-06-12T08:00:00.000Z';
const T3 = '2026-06-13T08:00:00.000Z';

describe('Sync-Reconciliation: decide (Last-Write-Wins)', () => {
  it('nur lokal vorhanden → keep-local', () => {
    expect(decide(rec('a', T1), undefined)).toBe('keep-local');
  });

  it('nur remote vorhanden → take-remote', () => {
    expect(decide(undefined, rec('a', T1))).toBe('take-remote');
  });

  it('neuerer Remote-Zeitstempel gewinnt', () => {
    expect(decide(rec('a', T1), rec('a', T2))).toBe('take-remote');
  });

  it('neuerer lokaler Zeitstempel gewinnt', () => {
    expect(decide(rec('a', T3), rec('a', T2))).toBe('keep-local');
  });

  it('gleicher Zeitstempel → equal', () => {
    expect(decide(rec('a', T2), rec('a', T2))).toBe('equal');
  });

  it('ungültiger lokaler Zeitstempel → take-remote', () => {
    expect(decide(rec('a', 'nonsense'), rec('a', T2))).toBe('take-remote');
  });

  it('beide ungültig → equal', () => {
    expect(decide(rec('a', 'x'), rec('a', 'y'))).toBe('equal');
  });
});

describe('Sync-Reconciliation: Soft-Delete-Semantik', () => {
  it('neuere Löschung überstimmt ältere Bearbeitung', () => {
    const local = rec('a', T1, false);
    const remoteDeleted = rec('a', T2, true);
    expect(decide(local, remoteDeleted)).toBe('take-remote');
  });

  it('neuere Bearbeitung überstimmt ältere Löschung', () => {
    const localDeleted = rec('a', T1, true);
    const remoteEdit = rec('a', T2, false);
    const result = mergeRecords([localDeleted], [remoteEdit]);
    expect(result.merged[0]!.deleted).toBe(false);
    expect(result.toWriteLocal).toHaveLength(1);
  });
});

describe('Sync-Reconciliation: mergeRecords', () => {
  it('vereinigt disjunkte lokale und entfernte Mengen', () => {
    const result = mergeRecords([rec('a', T1)], [rec('b', T1)]);
    expect(result.merged.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('lokal-only-Datensätze landen in toPushRemote', () => {
    const result = mergeRecords([rec('a', T1)], []);
    expect(result.toPushRemote.map((r) => r.id)).toEqual(['a']);
    expect(result.toWriteLocal).toHaveLength(0);
  });

  it('remote-only-Datensätze landen in toWriteLocal', () => {
    const result = mergeRecords([], [rec('a', T1)]);
    expect(result.toWriteLocal.map((r) => r.id)).toEqual(['a']);
    expect(result.toPushRemote).toHaveLength(0);
  });

  it('bei Konflikt gewinnt der jüngere und wird lokal geschrieben', () => {
    const result = mergeRecords([rec('a', T1)], [rec('a', T3)]);
    expect(result.merged).toHaveLength(1);
    expect(result.merged[0]!.updated_at).toBe(T3);
    expect(result.toWriteLocal.map((r) => r.id)).toEqual(['a']);
    expect(result.toPushRemote).toHaveLength(0);
  });

  it('gleichstehende Datensätze werden weder geschrieben noch gepusht', () => {
    const result = mergeRecords([rec('a', T2)], [rec('a', T2)]);
    expect(result.toWriteLocal).toHaveLength(0);
    expect(result.toPushRemote).toHaveLength(0);
    expect(result.merged).toHaveLength(1);
  });

  it('idempotenz: zweimaliges Mergen ändert nichts mehr', () => {
    const first = mergeRecords([rec('a', T1)], [rec('a', T3)]);
    const second = mergeRecords(first.merged, [rec('a', T3)]);
    expect(second.toWriteLocal).toHaveLength(0);
    expect(second.toPushRemote).toHaveLength(0);
  });
});
