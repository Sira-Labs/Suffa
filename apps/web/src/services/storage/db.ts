/**
 * IndexedDB-Schema (Dexie) – die Single Source of Truth auf dem Gerät.
 *
 * Alle Lerndaten leben hier; die UI liest/schreibt ausschließlich gegen diese DB.
 * Der Sync gleicht sie später mit dem Backend ab (Offline-first, siehe ADR-0002).
 *
 * Zusätzlich: eine persistente Mutation-Queue (`outbox`), die jede lokale
 * Änderung an synchronisierbaren Tabellen festhält, bis sie gepusht wurde.
 */
import Dexie, { type Table } from 'dexie';
import type {
  ExamResult,
  ReviewLog,
  SettingsRecord,
  SrsCard,
  SyncTable,
  UserVocab,
} from '@/types';

export interface OutboxEntry {
  /** Auto-Increment-Schlüssel (nur lokal, nicht synchronisiert). */
  seq?: number;
  table: SyncTable;
  recordId: string;
  /** Zeitpunkt der lokalen Mutation. */
  queuedAt: string;
}

/** Lokale Sync-Metadaten (z. B. letzter Pull-Zeitpunkt pro Tabelle). */
export interface SyncMeta {
  key: string;
  value: string;
}

export class AppDatabase extends Dexie {
  srs_cards!: Table<SrsCard, string>;
  review_logs!: Table<ReviewLog, string>;
  exam_results!: Table<ExamResult, string>;
  settings!: Table<SettingsRecord, string>;
  user_vocab!: Table<UserVocab, string>;
  outbox!: Table<OutboxEntry, number>;
  sync_meta!: Table<SyncMeta, string>;

  constructor(name = 'bayna-yadayk') {
    super(name);
    this.version(1).stores({
      // Primärschlüssel + Indizes. `updated_at` & `deleted` für Sync-Abfragen.
      srs_cards: 'id, contentRef, kind, due, updated_at, deleted, leech',
      review_logs: 'id, cardId, reviewedAt, updated_at, deleted',
      exam_results: 'id, format, finishedAt, updated_at, deleted',
      settings: 'id, key, updated_at, deleted',
      user_vocab: 'id, wurzel, einheit, updated_at, deleted',
      outbox: '++seq, table, recordId, queuedAt',
      sync_meta: 'key',
    });
  }
}

export const db = new AppDatabase();

/** Liste der synchronisierbaren Tabellen-Handles (für generische Sync-Routinen). */
export function syncableTables(
  database: AppDatabase
): Record<
  SyncTable,
  Table<{ id: string; updated_at: string; deleted: boolean }, string>
> {
  return {
    srs_cards: database.srs_cards,
    review_logs: database.review_logs,
    exam_results: database.exam_results,
    settings: database.settings,
    user_vocab: database.user_vocab,
  };
}
