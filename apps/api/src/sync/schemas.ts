/**
 * Wire contract of the synced tables: one zod schema per table (validation of pushed
 * records) and the column list the SQL is built from. Column names only ever come from
 * this file, never from request data, so the dynamic SQL in the repository is injection-safe.
 *
 * Mirrors `apps/web/src/types/*.ts` (camelCase columns).
 */
import { z } from 'zod';

const isoTimestamp = z.string().datetime({ offset: true });
const shortText = z.string().max(500);

/** Fields every synced record carries (ADR-0002). */
const base = {
  id: z.string().min(1).max(200),
  updated_at: isoTimestamp,
  deleted: z.boolean(),
};

const cardKind = z.enum([
  'vocab_ar_de',
  'vocab_de_ar',
  'plural',
  'root_to_word',
  'nisba',
  'conjugation',
  'minimalpair',
]);

export const SYNC_SCHEMAS = {
  srs_cards: z.object({
    ...base,
    contentRef: shortText.min(1),
    kind: cardKind,
    interval: z.number().int().min(0).max(36_500),
    ease: z.number().min(1).max(10),
    reps: z.number().int().min(0),
    lapses: z.number().int().min(0),
    due: isoTimestamp,
    lastReviewed: isoTimestamp.nullable(),
    leech: z.boolean(),
  }),
  review_logs: z.object({
    ...base,
    cardId: shortText.min(1),
    contentRef: shortText.min(1),
    kind: cardKind,
    rating: z.enum(['again', 'hard', 'good', 'easy']),
    durationMs: z.number().int().min(0).max(86_400_000),
    scheduledInterval: z.number().int().min(0).max(36_500),
    reviewedAt: isoTimestamp,
  }),
  exam_results: z.object({
    ...base,
    format: z.string().min(1).max(40),
    units: z.array(z.number().int().min(0).max(1000)).max(100),
    score: z.number().int().min(0),
    total: z.number().int().min(0),
    items: z.array(z.record(z.unknown())).max(500),
    startedAt: isoTimestamp,
    finishedAt: isoTimestamp,
  }),
  settings: z.object({
    ...base,
    key: z.literal('user-settings'),
    tashkilLevel: z.enum(['full', 'partial', 'none']),
    theme: z.enum(['dark', 'light']),
    arabicFontScale: z.number().min(0.5).max(3),
    dailyGoal: z.number().int().min(1).max(1000),
    // Active days per week (story 5.5); older app versions do not send it yet.
    weeklyGoal: z.union([z.literal(3), z.literal(5), z.literal(7)]).default(5),
    showTransliteration: z.boolean(),
    dialectNotes: z.boolean(),
  }),
  user_vocab: z.object({
    ...base,
    ar: shortText.min(1),
    tr: shortText.default(''),
    de: shortText.min(1),
    wurzel: shortText.min(1),
    wazn: shortText.nullish(),
    plural: shortText.nullish(),
    einheit: z.number().int().min(0).max(1000),
    hinweis: z.string().max(2000).nullish(),
  }),
  // Progress (units, XP, streak, media): the app derives unlocked units and XP from these.
  practice_progress: z.object({
    ...base,
    unit: z.number().int().min(0).max(1000),
    skill: z.enum(['read', 'grammar', 'cloze', 'write', 'speak', 'verbs', 'letters']),
    itemId: shortText.min(1),
    practisedAt: isoTimestamp,
  }),
  unit_enrollments: z.object({
    ...base,
    book: z.number().int().min(1).max(100),
    unit: z.number().int().min(0).max(1000),
    pace: z.enum(['relaxed', 'normal', 'intensive']),
    startedAt: isoTimestamp,
    dueAt: isoTimestamp,
    extended: z.boolean(),
  }),
  daily_checkins: z.object({
    ...base,
    wordId: shortText.min(1),
    checkedAt: isoTimestamp,
  }),
  discover_progress: z.object({
    ...base,
    startedAt: isoTimestamp.nullable(),
    openedAt: isoTimestamp,
    pinned: z.boolean(),
    positionSec: z.number().min(0).max(1_000_000).nullish(),
    playlistIndex: z.number().int().min(0).max(10_000).nullish(),
    durationSec: z.number().min(0).max(1_000_000).nullish(),
  }),
  media_progress: z.object({
    ...base,
    source: z.enum(['publisher-audio', 'discover-video', 'recording']),
    ref: z.string().min(1).max(2000),
    lessonKey: shortText,
    durationSec: z.number().min(0).max(1_000_000),
    listenedSec: z.number().min(0).max(1_000_000),
    completedAt: isoTimestamp.nullable(),
  }),
} as const;

export type SyncTableName = keyof typeof SYNC_SCHEMAS;
export type SyncRecord = Record<string, unknown> & {
  id: string;
  updated_at: string;
  deleted: boolean;
};

export const SYNC_TABLES = Object.keys(SYNC_SCHEMAS) as SyncTableName[];

export function isSyncTable(name: string): name is SyncTableName {
  return Object.prototype.hasOwnProperty.call(SYNC_SCHEMAS, name);
}

/** Columns stored as jsonb (serialised on write). */
export const JSON_COLUMNS: ReadonlySet<string> = new Set(['units', 'items']);

/** Record columns per table, in schema order (user_id is added by the server). */
export function columnsOf(table: SyncTableName): string[] {
  return Object.keys(SYNC_SCHEMAS[table].shape);
}

/** Upper bounds that keep one request cheap for the database. */
export const MAX_PUSH_RECORDS = 500;
export const MAX_PULL_LIMIT = 1000;
export const DEFAULT_PULL_LIMIT = 500;
