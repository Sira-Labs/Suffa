/**
 * Sync reconciliation: conflict resolution via last-write-wins (LWW) per record.
 *
 * ADR-0002: We compare `updated_at` (ISO timestamp). The newer record wins –
 * whole record, no field merge. Rationale: simple, predictable semantics;
 * learning data is fine-grained and rarely edited truly concurrently on two
 * devices. Soft deletes (`deleted: true`) take part in LWW as a normal record –
 * so a later edit can override an older deletion.
 *
 * These functions are pure (no I/O) so they are deterministically testable.
 */

export interface Reconcilable {
  id: string;
  updated_at: string;
  deleted: boolean;
}

export type ReconcileDecision = 'keep-local' | 'take-remote' | 'equal';

/** Compares two versions of the same record. */
export function decide<T extends Reconcilable>(
  local: T | undefined,
  remote: T | undefined
): ReconcileDecision {
  if (local && !remote) return 'keep-local';
  if (!local && remote) return 'take-remote';
  if (!local && !remote) return 'equal';

  const l = local as T;
  const r = remote as T;
  const lt = Date.parse(l.updated_at);
  const rt = Date.parse(r.updated_at);

  if (Number.isNaN(lt) && Number.isNaN(rt)) return 'equal';
  if (Number.isNaN(lt)) return 'take-remote';
  if (Number.isNaN(rt)) return 'keep-local';

  if (rt > lt) return 'take-remote';
  if (lt > rt) return 'keep-local';
  return 'equal';
}

export interface MergeResult<T> {
  /** Fully merged set (for persistence). */
  merged: T[];
  /** Records that must be updated/adopted locally. */
  toWriteLocal: T[];
  /** Local records that (still) need to go to the backend because they are newer. */
  toPushRemote: T[];
}

/**
 * Merges local and remote records via LWW.
 *
 * @param locals  current local state
 * @param remotes records pulled from the backend
 */
export function mergeRecords<T extends Reconcilable>(
  locals: T[],
  remotes: T[]
): MergeResult<T> {
  const localMap = new Map(locals.map((r) => [r.id, r]));
  const remoteMap = new Map(remotes.map((r) => [r.id, r]));
  const ids = new Set<string>([...localMap.keys(), ...remoteMap.keys()]);

  const merged: T[] = [];
  const toWriteLocal: T[] = [];
  const toPushRemote: T[] = [];

  for (const id of ids) {
    const local = localMap.get(id);
    const remote = remoteMap.get(id);
    const decision = decide(local, remote);

    switch (decision) {
      case 'keep-local': {
        const winner = local as T;
        merged.push(winner);
        // Local is newer than (or has no) remote → still needs to be pushed.
        toPushRemote.push(winner);
        break;
      }
      case 'take-remote': {
        const winner = remote as T;
        merged.push(winner);
        toWriteLocal.push(winner);
        break;
      }
      case 'equal': {
        const winner = (local ?? remote) as T;
        merged.push(winner);
        break;
      }
    }
  }

  return { merged, toWriteLocal, toPushRemote };
}
