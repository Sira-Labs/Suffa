/**
 * IndexedDB schema (Dexie) – the single source of truth on the device.
 *
 * All learning data lives here; the UI reads/writes exclusively against this DB.
 * Sync later reconciles it with the backend (offline-first, see ADR-0002).
 *
 * Additionally: a persistent mutation queue (`outbox`) that records every local
 * change to syncable tables until it has been pushed.
 */
import Dexie, { type Table } from 'dexie';
import type {
  DailyCheckIn,
  DiscoverProgress,
  ExamResult,
  MediaProgress,
  PracticeRecord,
  UnitEnrollment,
  ReviewLog,
  SettingsRecord,
  SrsCard,
  SyncTable,
  UserVocab,
} from '@/types';

export interface OutboxEntry {
  /** Auto-increment key (local only, not synced). */
  seq?: number;
  table: SyncTable;
  recordId: string;
  /** Time of the local mutation. */
  queuedAt: string;
}

/** Local sync metadata (e.g. last pull time per table). */
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
  /** Heard publisher audio and seen videos. */
  media_progress!: Table<MediaProgress, string>;
  /** Practised items of the unit skills (unlocks units, earns XP). */
  practice_progress!: Table<PracticeRecord, string>;
  /** Started units with pace and target date. */
  unit_enrollments!: Table<UnitEnrollment, string>;
  daily_checkins!: Table<DailyCheckIn, string>;
  discover_progress!: Table<DiscoverProgress, string>;

  constructor(name = 'bayna-yadayk') {
    super(name);
    this.version(1).stores({
      // Primary key + indexes. `updated_at` & `deleted` for sync queries.
      srs_cards: 'id, contentRef, kind, due, updated_at, deleted, leech',
      review_logs: 'id, cardId, reviewedAt, updated_at, deleted',
      exam_results: 'id, format, finishedAt, updated_at, deleted',
      settings: 'id, key, updated_at, deleted',
      user_vocab: 'id, wurzel, einheit, updated_at, deleted',
      outbox: '++seq, table, recordId, queuedAt',
      sync_meta: 'key',
    });
    // v2: listening progress (ADR-0018); existing tables are unchanged.
    this.version(2).stores({
      media_progress: 'id, lessonKey, completedAt, updated_at, deleted',
    });
    // v3: unit skill practice (reading, writing, speaking, verbs); existing tables unchanged.
    this.version(3).stores({
      practice_progress: 'id, unit, skill, updated_at, deleted',
    });
    // v4: started units with pace and target date (step 2 of the unit room).
    this.version(4).stores({
      unit_enrollments: 'id, unit, updated_at, deleted',
    });
    // v5: daily check-in with the word of the day.
    this.version(5).stores({
      daily_checkins: 'id, updated_at, deleted',
    });
    // v6: started and pinned items of the "Entdecken" library.
    this.version(6).stores({
      discover_progress: 'id, openedAt, updated_at, deleted',
    });
    // Progress tables join sync: queue what this device already has, once, so it reaches
    // the account (and the learner's other devices) on the next sync.
    this.version(7)
      .stores({})
      .upgrade(async (tx) => {
        const queuedAt = new Date().toISOString();
        for (const table of PROGRESS_TABLES) {
          const ids = (await tx.table(table).toCollection().primaryKeys()) as string[];
          await tx
            .table('outbox')
            .bulkAdd(ids.map((recordId) => ({ table, recordId, queuedAt })));
        }
      });
  }
}

/** Progress tables that joined sync in schema version 7 (story: sync units and XP). */
export const PROGRESS_TABLES = [
  'practice_progress',
  'unit_enrollments',
  'daily_checkins',
  'discover_progress',
  'media_progress',
] as const satisfies readonly SyncTable[];

export const db = new AppDatabase();

/** Syncable table handles (for generic sync routines). */
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
    practice_progress: database.practice_progress,
    unit_enrollments: database.unit_enrollments,
    daily_checkins: database.daily_checkins,
    discover_progress: database.discover_progress,
    media_progress: database.media_progress,
  };
}
