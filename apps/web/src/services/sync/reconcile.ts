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

/** Decides between two existing versions of the same record. */
export type Precedence<T> = (local: T, remote: T) => ReconcileDecision;

/** Compares two versions of the same record (default: last-write-wins). */
export function decide<T extends Reconcilable>(
  local: T | undefined,
  remote: T | undefined,
  precedence: Precedence<T> = lastWriteWins
): ReconcileDecision {
  if (local && !remote) return 'keep-local';
  if (!local && remote) return 'take-remote';
  if (!local && !remote) return 'equal';
  return precedence(local as T, remote as T);
}

/** Newer `updated_at` wins; unparsable timestamps lose. */
export function lastWriteWins<T extends Reconcilable>(l: T, r: T): ReconcileDecision {
  const lt = Date.parse(l.updated_at);
  const rt = Date.parse(r.updated_at);

  if (Number.isNaN(lt) && Number.isNaN(rt)) return 'equal';
  if (Number.isNaN(lt)) return 'take-remote';
  if (Number.isNaN(rt)) return 'keep-local';

  if (rt > lt) return 'take-remote';
  if (lt > rt) return 'keep-local';
  return 'equal';
}

interface ReviewedCard extends Reconcilable {
  lastReviewed: string | null;
}

/**
 * SRS cards: the version with the later actual review wins; `updated_at` only breaks ties.
 *
 * Plain last-write-wins lost learning progress: a device creates missing cards with a fresh
 * `updated_at` when the app starts, so an untouched card created today beat the same card
 * reviewed yesterday on another device. A card never reviewed now never beats a reviewed one.
 */
export function cardPrecedence<T extends ReviewedCard>(l: T, r: T): ReconcileDecision {
  const lr = l.lastReviewed ? Date.parse(l.lastReviewed) : Number.NEGATIVE_INFINITY;
  const rr = r.lastReviewed ? Date.parse(r.lastReviewed) : Number.NEGATIVE_INFINITY;
  if (rr > lr) return 'take-remote';
  if (lr > rr) return 'keep-local';
  return lastWriteWins(l, r);
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
 * @param locals     current local state
 * @param remotes    records pulled from the backend
 * @param precedence how to choose between two versions (default: last-write-wins)
 */
export function mergeRecords<T extends Reconcilable>(
  locals: T[],
  remotes: T[],
  precedence: Precedence<T> = lastWriteWins
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
    const decision = decide(local, remote, precedence);

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

interface Listening extends Reconcilable {
  completedAt: string | null;
  listenedSec: number;
}

/**
 * Listening progress: a track heard to the end stays heard (it earned its XP), whichever
 * device played it last; between two unfinished versions, more listening wins, then LWW.
 */
export function listeningPrecedence<T extends Listening>(l: T, r: T): ReconcileDecision {
  if (l.completedAt && !r.completedAt) return 'keep-local';
  if (r.completedAt && !l.completedAt) return 'take-remote';
  if (!l.completedAt && !r.completedAt && l.listenedSec !== r.listenedSec) {
    return l.listenedSec > r.listenedSec ? 'keep-local' : 'take-remote';
  }
  return lastWriteWins(l, r);
}
