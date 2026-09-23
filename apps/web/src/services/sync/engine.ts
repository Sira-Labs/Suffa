/**
 * Sync-Engine: orchestriert die persistente Mutation-Queue (Outbox) mit
 * push → pull → reconcile gegen einen beliebigen SyncProvider.
 *
 * Ablauf eines Sync-Zyklus pro Tabelle:
 *   1. PUSH: alle in der Outbox vermerkten lokalen Datensätze hochladen.
 *   2. PULL: seit dem letzten Sync geänderte Remote-Datensätze holen.
 *   3. RECONCILE: per Last-Write-Wins zusammenführen (siehe reconcile.ts/ADR-0002).
 *   4. WRITE: Gewinner lokal schreiben; nur erfolgreich gepushte Outbox-Einträge löschen.
 *
 * Offline-Sicherheit: schlägt push/pull fehl, bleibt die Outbox erhalten und der
 * nächste Zyklus versucht es erneut. Kein Datenverlust.
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

  /** Führt einen vollständigen Sync-Zyklus über alle Tabellen aus. */
  async sync(): Promise<SyncResult> {
    if (this.running) {
      log.debug('Sync bereits aktiv – übersprungen');
      return { pushed: 0, pulled: 0, conflictsResolved: 0 };
    }
    if (!this.provider.isConfigured()) {
      return { pushed: 0, pulled: 0, conflictsResolved: 0 };
    }
    if (this.provider.getAuthState().status !== 'signed-in') {
      log.debug('Nicht angemeldet – Sync übersprungen');
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
      log.info('Sync abgeschlossen', { ...totals });
      return totals;
    } finally {
      this.running = false;
    }
  }

  private async syncTable(table: SyncTable): Promise<SyncResult> {
    const tables = syncableTables(this.database);
    const handle = tables[table];

    // Outbox-Einträge dieser Tabelle einsammeln (lokal geänderte Datensätze).
    const outboxEntries = await this.database.outbox
      .where('table')
      .equals(table)
      .toArray();
    const dirtyIds = [...new Set(outboxEntries.map((e) => e.recordId))];
    const dirtyRecords = (await Promise.all(dirtyIds.map((id) => handle.get(id)))).filter(
      (r): r is Reconcilable & SyncableRecord => Boolean(r)
    );

    // 1. PULL seit letztem Sync. Bewusst VOR dem Push: nur so verhindert
    //    Last-Write-Wins, dass ein älterer lokaler Datensatz einen neueren
    //    Remote-Stand überschreibt (push würde sonst blind upserten).
    const sinceMeta = await this.database.sync_meta.get(lastPullKey(table));
    const since = sinceMeta?.value ?? null;
    const pullResult = await this.provider.pull(table, since);
    if (!pullResult.ok) {
      log.warn('pull fehlgeschlagen', { table, error: pullResult.error.message });
      return { pushed: 0, pulled: 0, conflictsResolved: 0 };
    }
    const remotes = pullResult.value as (Reconcilable & SyncableRecord)[];

    // 2. RECONCILE: lokale Eingabemenge = dirty (Outbox) ∪ aktuelle lokale
    //    Versionen der gepullten IDs. So werden Konflikte korrekt per LWW gelöst.
    const localMap = new Map<string, Reconcilable & SyncableRecord>();
    for (const r of dirtyRecords) localMap.set(r.id, r);
    const remoteOnlyIds = remotes.map((r) => r.id).filter((id) => !localMap.has(id));
    const extraLocals = (
      await Promise.all(remoteOnlyIds.map((id) => handle.get(id)))
    ).filter((r): r is Reconcilable & SyncableRecord => Boolean(r));
    for (const r of extraLocals) localMap.set(r.id, r);

    const { toWriteLocal, toPushRemote } = mergeRecords([...localMap.values()], remotes);

    // 3. WRITE: Remote-Gewinner lokal persistieren (ohne neuen Outbox-Eintrag).
    if (toWriteLocal.length > 0) {
      await handle.bulkPut(toWriteLocal);
    }

    // 4. PUSH: nur die lokalen Gewinner (neuer als bzw. unbekannt im Backend).
    let pushed = 0;
    if (toPushRemote.length > 0) {
      const pushResult = await this.provider.push(table, toPushRemote);
      if (!pushResult.ok) {
        // Outbox bleibt erhalten → nächster Zyklus versucht es erneut.
        log.warn('push fehlgeschlagen, Outbox behalten', {
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

    // Outbox-Einträge sind erledigt, sobald ihr Datensatz entweder gepusht oder
    // durch einen neueren Remote-Stand ersetzt wurde. Beides ist hier der Fall.
    await this.clearOutbox(outboxEntries);

    // Pull-Wasserzeichen vorrücken.
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
