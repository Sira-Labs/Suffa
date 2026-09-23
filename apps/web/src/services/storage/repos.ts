/**
 * Repository layer on top of Dexie. Every write:
 *   1. sets `updated_at` (for last-write-wins),
 *   2. writes the record locally,
 *   3. creates an outbox entry (persistent mutation queue for sync).
 *
 * This keeps the UI fully functional offline, and every change is
 * guaranteed to be synced eventually.
 */
import { v4 as uuid } from 'uuid';
import type {
  ExamResult,
  ReviewLog,
  SettingsRecord,
  SrsCard,
  SyncTable,
  UserVocab,
} from '@/types';
import { db, type AppDatabase, type OutboxEntry } from './db';
import { logger } from '@/services/logger';

const log = logger.child('storage');

async function enqueue(table: SyncTable, recordId: string, database: AppDatabase = db) {
  const entry: OutboxEntry = {
    table,
    recordId,
    queuedAt: new Date().toISOString(),
  };
  await database.outbox.add(entry);
}

function stamp<T extends { updated_at: string }>(record: T): T {
  return { ...record, updated_at: new Date().toISOString() };
}

/* ----------------------------- SRS cards ----------------------------- */

export const cardRepo = {
  async all(database: AppDatabase = db): Promise<SrsCard[]> {
    return database.srs_cards.filter((c) => !c.deleted).toArray();
  },
  async get(id: string, database: AppDatabase = db): Promise<SrsCard | undefined> {
    return database.srs_cards.get(id);
  },
  async byContentRef(ref: string, database: AppDatabase = db): Promise<SrsCard[]> {
    return database.srs_cards.where('contentRef').equals(ref).toArray();
  },
  async put(card: SrsCard, database: AppDatabase = db): Promise<void> {
    const stamped = stamp(card);
    await database.transaction('rw', database.srs_cards, database.outbox, async () => {
      await database.srs_cards.put(stamped);
      await enqueue('srs_cards', stamped.id, database);
    });
    log.debug('card put', { id: stamped.id, kind: stamped.kind });
  },
  async softDelete(id: string, database: AppDatabase = db): Promise<void> {
    const existing = await database.srs_cards.get(id);
    if (!existing) return;
    await cardRepo.put({ ...existing, deleted: true }, database);
  },
};

/* ----------------------------- Review logs ----------------------------- */

export const reviewLogRepo = {
  async all(database: AppDatabase = db): Promise<ReviewLog[]> {
    return database.review_logs.filter((r) => !r.deleted).toArray();
  },
  async add(
    input: Omit<ReviewLog, 'id' | 'updated_at' | 'deleted'>,
    database: AppDatabase = db
  ): Promise<ReviewLog> {
    const record: ReviewLog = {
      ...input,
      id: uuid(),
      updated_at: new Date().toISOString(),
      deleted: false,
    };
    await database.transaction('rw', database.review_logs, database.outbox, async () => {
      await database.review_logs.put(record);
      await enqueue('review_logs', record.id, database);
    });
    return record;
  },
};

/* ----------------------------- Exam results ----------------------------- */

export const examRepo = {
  async all(database: AppDatabase = db): Promise<ExamResult[]> {
    return database.exam_results.filter((e) => !e.deleted).toArray();
  },
  async add(
    input: Omit<ExamResult, 'id' | 'updated_at' | 'deleted'>,
    database: AppDatabase = db
  ): Promise<ExamResult> {
    const record: ExamResult = {
      ...input,
      id: uuid(),
      updated_at: new Date().toISOString(),
      deleted: false,
    };
    await database.transaction('rw', database.exam_results, database.outbox, async () => {
      await database.exam_results.put(record);
      await enqueue('exam_results', record.id, database);
    });
    return record;
  },
};

/* ----------------------------- Settings ----------------------------- */

export const SETTINGS_ID = 'user-settings';

export const defaultSettings: SettingsRecord = {
  id: SETTINGS_ID,
  key: 'user-settings',
  tashkilLevel: 'full',
  theme: 'dark',
  arabicFontScale: 1,
  dailyGoal: 20,
  showTransliteration: true,
  dialectNotes: false,
  updated_at: new Date(0).toISOString(),
  deleted: false,
};

export const settingsRepo = {
  async get(database: AppDatabase = db): Promise<SettingsRecord> {
    const existing = await database.settings.get(SETTINGS_ID);
    return existing ?? defaultSettings;
  },
  async save(settings: SettingsRecord, database: AppDatabase = db): Promise<void> {
    const stamped = stamp({
      ...settings,
      id: SETTINGS_ID,
      key: 'user-settings' as const,
    });
    await database.transaction('rw', database.settings, database.outbox, async () => {
      await database.settings.put(stamped);
      await enqueue('settings', SETTINGS_ID, database);
    });
  },
};

/* ----------------------------- User vocabulary ----------------------------- */

export const userVocabRepo = {
  async all(database: AppDatabase = db): Promise<UserVocab[]> {
    return database.user_vocab.filter((v) => !v.deleted).toArray();
  },
  async add(
    input: Omit<UserVocab, 'id' | 'updated_at' | 'deleted'>,
    database: AppDatabase = db
  ): Promise<UserVocab> {
    const record: UserVocab = {
      ...input,
      id: uuid(),
      updated_at: new Date().toISOString(),
      deleted: false,
    };
    await database.transaction('rw', database.user_vocab, database.outbox, async () => {
      await database.user_vocab.put(record);
      await enqueue('user_vocab', record.id, database);
    });
    return record;
  },
  async softDelete(id: string, database: AppDatabase = db): Promise<void> {
    const existing = await database.user_vocab.get(id);
    if (!existing) return;
    const updated = stamp({ ...existing, deleted: true });
    await database.transaction('rw', database.user_vocab, database.outbox, async () => {
      await database.user_vocab.put(updated);
      await enqueue('user_vocab', id, database);
    });
  },
};
