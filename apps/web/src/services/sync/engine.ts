/**
 * Sync engine: orchestrates the persistent mutation queue (outbox) with
 * push → pull → reconcile against any SyncProvider.
 *
 * Flow of a sync cycle per table:
 *   1. PUSH: upload all local records noted in the outbox.
 *   2. PULL: fetch remote records changed since the last sync.
 *   3. RECONCILE: merge via last-write-wins (see reconcile.ts/ADR-0002).
 *   4. WRITE: write winners locally; delete only successfully pushed outbox entries.
 *
 * Offline safety: if push/pull fails, the outbox is kept and the next cycle
 * retries. No data loss.
 */
import type { SyncTable } from '@/types';
import {
  db,
  syncableTables,
  type AppDatabase,
  type OutboxEntry,
} from '@/services/storage';
import { logger } from '@/services/logger';
import { mergeRecords, type Reconcilable } from './reconcile';
import type { SyncProvider, SyncableRecord } from './provider';

const log = logger.child('sync:engine');

const SYNC_TABLES: SyncTable[] = [
  'srs_cards',
  'review_logs',
  'exam_results',
  'settings',
  'user_vocab',
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
}

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
      return { pushed: 0, pulled: 0, conflictsResolved: 0 };
    }
    if (!this.provider.isConfigured()) {
      return { pushed: 0, pulled: 0, conflictsResolved: 0 };
    }
    if (this.provider.getAuthState().status !== 'signed-in') {
      log.debug('Not signed in – sync skipped');
      return { pushed: 0, pulled: 0, conflictsResolved: 0 };
    }

    this.running = true;
    const totals: SyncResult = { pushed: 0, pulled: 0, conflictsResolved: 0 };
    try {
      for (const table of SYNC_TABLES) {
        const partial = await this.syncTable(table);
        totals.pushed += partial.pushed;
        totals.pulled += partial.pulled;
        totals.conflictsResolved += partial.conflictsResolved;
      }
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
      return { pushed: 0, pulled: 0, conflictsResolved: 0 };
    }
    const remotes = pullResult.value as (Reconcilable & SyncableRecord)[];

    // 2. RECONCILE: local input set = dirty (outbox) ∪ current local versions
    //    of the pulled IDs. This way conflicts are resolved correctly via LWW.
    const localMap = new Map<string, Reconcilable & SyncableRecord>();
    for (const r of dirtyRecords) localMap.set(r.id, r);
    const remoteOnlyIds = remotes.map((r) => r.id).filter((id) => !localMap.has(id));
    const extraLocals = (
      await Promise.all(remoteOnlyIds.map((id) => handle.get(id)))
    ).filter((r): r is Reconcilable & SyncableRecord => Boolean(r));
    for (const r of extraLocals) localMap.set(r.id, r);

    const { toWriteLocal, toPushRemote } = mergeRecords([...localMap.values()], remotes);

    // 3. WRITE: persist remote winners locally (without a new outbox entry).
    if (toWriteLocal.length > 0) {
      await handle.bulkPut(toWriteLocal);
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
          pushed: 0,
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
      pushed,
      pulled: toWriteLocal.length,
      conflictsResolved: toWriteLocal.length,
    };
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
