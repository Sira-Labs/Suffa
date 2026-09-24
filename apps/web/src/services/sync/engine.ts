/**
 * Sync engine: orchestrates the persistent mutation queue (outbox) with
 * push → pull → reconcile against any SyncProvider.
 *
 * Flow of a sync cycle per table:
 *   1. PUSH: upload all local records noted in the outbox.
 *   2. PULL: fetch remote records changed since the last sync.
 *   3. RECONCILE: merge via last-write-wins (see reconcile.ts/ADR-0002).
 *   4. WRITE: write winners locally; delete only successfully pushed outbox entries.
 * After all tables: cards whose review logs are ahead of them are rebuilt from the logs
 * (repairCards.ts) and pushed, so learning progress made on any device survives.
 *
 * Offline safety: if push/pull fails, the outbox is kept and the next cycle
 * retries. No data loss.
 */
import type { SrsCard, SyncTable } from '@/types';
import {
  cardRepo,
  db,
  reviewLogRepo,
  syncableTables,
  type AppDatabase,
  type OutboxEntry,
} from '@/services/storage';
import { logger } from '@/services/logger';
import {
  cardPrecedence,
  lastWriteWins,
  listeningPrecedence,
  mergeRecords,
  type Precedence,
  type Reconcilable,
} from './reconcile';
import { cardsToRepair } from './repairCards';
import type { SyncProvider, SyncableRecord } from './provider';

const log = logger.child('sync:engine');

const SYNC_TABLES: SyncTable[] = [
  'srs_cards',
  'review_logs',
  'exam_results',
  'settings',
  'user_vocab',
  'practice_progress',
  'unit_enrollments',
  'daily_checkins',
  'discover_progress',
  'media_progress',
];

export type SyncStatus =
  | { state: 'idle'; lastSyncAt: string | null }
  | { state: 'syncing' }
  | { state: 'offline' }
  | { state: 'error'; message: string; lastSyncAt: string | null };

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflictsResolved: number;
  /** Cards rebuilt from their review logs. */
  repaired: number;
}

type SyncRecordOf = Reconcilable & SyncableRecord;

/** How two versions of a record are weighed, per table (default: last-write-wins). */
function precedenceFor(table: SyncTable): Precedence<SyncRecordOf> {
  switch (table) {
    case 'srs_cards':
      return cardPrecedence as unknown as Precedence<SyncRecordOf>;
    case 'media_progress':
      return listeningPrecedence as unknown as Precedence<SyncRecordOf>;
    default:
      return lastWriteWins;
  }
}

/** Optional fields the server returns as null; the app models them as absent. */
const OPTIONAL_FIELDS: Partial<Record<SyncTable, readonly string[]>> = {
  discover_progress: ['positionSec', 'playlistIndex', 'durationSec'],
};

function fromServer(table: SyncTable, record: SyncRecordOf): SyncRecordOf {
  const optional = OPTIONAL_FIELDS[table];
  if (!optional) return record;
  const copy: Record<string, unknown> = { ...record };
  for (const field of optional) if (copy[field] === null) delete copy[field];
  return copy as SyncRecordOf;
}

const EMPTY: SyncResult = { pushed: 0, pulled: 0, conflictsResolved: 0, repaired: 0 };

function lastPullKey(table: SyncTable): string {
  return `lastPull:${table}`;
}

export class SyncEngine {
  private running = false;

  constructor(
    private provider: SyncProvider,
    private database: AppDatabase = db
  ) {}

  setProvider(provider: SyncProvider): void {
    this.provider = provider;
  }

  getProvider(): SyncProvider {
    return this.provider;
  }

  /** Runs a full sync cycle over all tables. */
  async sync(): Promise<SyncResult> {
    if (this.running) {
      log.debug('Sync already running – skipped');
      return { ...EMPTY };
    }
    if (!this.provider.isConfigured()) {
      return { ...EMPTY };
    }
    if (this.provider.getAuthState().status !== 'signed-in') {
      log.debug('Not signed in – sync skipped');
      return { ...EMPTY };
    }

    this.running = true;
    const totals: SyncResult = { ...EMPTY };
    const add = (partial: SyncResult) => {
      totals.pushed += partial.pushed;
      totals.pulled += partial.pulled;
      totals.conflictsResolved += partial.conflictsResolved;
    };
    try {
      for (const table of SYNC_TABLES) {
        // A backend that does not know a table yet (Supabase) keeps it local; outbox stays.
        if (this.provider.supportsTable?.(table) === false) continue;
        add(await this.syncTable(table));
      }
      // Review logs of all devices are now here: bring cards up to them and push the result.
      totals.repaired = await this.repairCards();
      if (totals.repaired > 0) add(await this.syncTable('srs_cards'));
      await this.database.sync_meta.put({
        key: 'lastSyncAt',
        value: new Date().toISOString(),
      });
      log.info('Sync completed', { ...totals });
      return totals;
    } finally {
      this.running = false;
    }
  }

  private async syncTable(table: SyncTable): Promise<SyncResult> {
    const tables = syncableTables(this.database);
    const handle = tables[table];

    // Collect this table's outbox entries (locally changed records).
    const outboxEntries = await this.database.outbox
      .where('table')
      .equals(table)
      .toArray();
    const dirtyIds = [...new Set(outboxEntries.map((e) => e.recordId))];
    const dirtyRecords = (await Promise.all(dirtyIds.map((id) => handle.get(id)))).filter(
      (r): r is Reconcilable & SyncableRecord => Boolean(r)
    );

    // 1. PULL since the last sync. Deliberately BEFORE the push: only this way
    //    does last-write-wins prevent an older local record from overwriting a
    //    newer remote state (push would otherwise upsert blindly).
    const sinceMeta = await this.database.sync_meta.get(lastPullKey(table));
    const since = sinceMeta?.value ?? null;
    const pullResult = await this.provider.pull(table, since);
    if (!pullResult.ok) {
      log.warn('pull failed', { table, error: pullResult.error.message });
      return { ...EMPTY };
    }
    const remotes = (pullResult.value as SyncRecordOf[]).map((r) => fromServer(table, r));

    // 2. RECONCILE: local input set = dirty (outbox) ∪ current local versions
    //    of the pulled IDs. This way conflicts are resolved correctly via LWW.
    const localMap = new Map<string, Reconcilable & SyncableRecord>();
    for (const r of dirtyRecords) localMap.set(r.id, r);
    const remoteOnlyIds = remotes.map((r) => r.id).filter((id) => !localMap.has(id));
    const extraLocals = (
      await Promise.all(remoteOnlyIds.map((id) => handle.get(id)))
    ).filter((r): r is Reconcilable & SyncableRecord => Boolean(r));
    for (const r of extraLocals) localMap.set(r.id, r);

    const merged = mergeRecords([...localMap.values()], remotes, precedenceFor(table));
    const { toWriteLocal } = merged;
    // A local winner that is not newer by timestamp (e.g. a reviewed card against a card
    // another device only created) gets a fresh one: the server's upsert and the other
    // devices' pulls both go by updated_at.
    const remoteById = new Map(remotes.map((r) => [r.id, r]));
    const now = new Date().toISOString();
    const toPushRemote = merged.toPushRemote.map((local) => {
      const remote = remoteById.get(local.id);
      return remote && local.updated_at <= remote.updated_at
        ? { ...local, updated_at: now }
        : local;
    });
    const restamped = toPushRemote.filter((r, i) => r !== merged.toPushRemote[i]);

    // 3. WRITE: persist remote winners locally (without a new outbox entry).
    if (toWriteLocal.length > 0 || restamped.length > 0) {
      await handle.bulkPut([...toWriteLocal, ...restamped]);
    }

    // 4. PUSH: only the local winners (newer than, or unknown to, the backend).
    let pushed = 0;
    if (toPushRemote.length > 0) {
      const pushResult = await this.provider.push(table, toPushRemote);
      if (!pushResult.ok) {
        // Outbox is kept → the next cycle retries.
        log.warn('push failed, outbox kept', {
          table,
          error: pushResult.error.message,
        });
        return {
          ...EMPTY,
          pulled: toWriteLocal.length,
          conflictsResolved: toWriteLocal.length,
        };
      }
      pushed = toPushRemote.length;
    }

    // Outbox entries are done once their record has either been pushed or
    // replaced by a newer remote state. Both are the case here.
    await this.clearOutbox(outboxEntries);

    // Advance the pull watermark.
    const newest = remotes.reduce<string>(
      (acc, r) => (r.updated_at > acc ? r.updated_at : acc),
      since ?? ''
    );
    if (newest) {
      await this.database.sync_meta.put({ key: lastPullKey(table), value: newest });
    }

    return {
      ...EMPTY,
      pushed,
      pulled: toWriteLocal.length,
      conflictsResolved: toWriteLocal.length,
    };
  }

  /** Rebuilds cards whose review logs are ahead of them; returns how many. */
  private async repairCards(): Promise<number> {
    const [cards, logs] = await Promise.all([
      cardRepo.all(this.database),
      reviewLogRepo.all(this.database),
    ]);
    const repaired: SrsCard[] = cardsToRepair(cards, logs);
    for (const card of repaired) await cardRepo.put(card, this.database);
    if (repaired.length > 0)
      log.info('cards rebuilt from review logs', { count: repaired.length });
    return repaired.length;
  }

  private async clearOutbox(entries: OutboxEntry[]): Promise<void> {
    const seqs = entries.map((e) => e.seq).filter((s): s is number => s !== undefined);
    if (seqs.length > 0) await this.database.outbox.bulkDelete(seqs);
  }

  async pendingCount(): Promise<number> {
    return this.database.outbox.count();
  }

  async lastSyncAt(): Promise<string | null> {
    const meta = await this.database.sync_meta.get('lastSyncAt');
    return meta?.value ?? null;
  }
}
