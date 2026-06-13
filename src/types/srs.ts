/**
 * Typen der synchronisierbaren Lerndaten.
 *
 * Jeder synchronisierbare Datensatz erbt von `Syncable`:
 *   - id:         UUID (geräteübergreifend stabil)
 *   - updated_at: ISO-Zeitstempel (Basis für Last-Write-Wins, siehe ADR-0002)
 *   - deleted:    Soft-Delete-Flag (Tombstone), damit Löschungen synchronisierbar sind
 */

export interface Syncable {
  id: string;
  updated_at: string;
  deleted: boolean;
}

/** Bewertung beim Active Recall (SM-2-Qualität dahinter gemappt). */
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

/** Welcher Aspekt einer Vokabel/eines Items trainiert wird. */
export type CardKind =
  | 'vocab_ar_de'
  | 'vocab_de_ar'
  | 'plural'
  | 'root_to_word'
  | 'nisba'
  | 'conjugation'
  | 'minimalpair';

/**
 * SRS-Kartenzustand (SM-2/FSRS-Stil). `contentRef` zeigt auf einen statischen
 * Inhalt (z. B. Vokabel-ID); der statische Inhalt selbst wird nicht gesynct.
 */
export interface SrsCard extends Syncable {
  contentRef: string;
  kind: CardKind;
  /** Tage bis zur nächsten Fälligkeit. */
  interval: number;
  /** Leichtigkeitsfaktor (SM-2), Minimum 1.3. */
  ease: number;
  /** Anzahl erfolgreicher Wiederholungen in Folge. */
  reps: number;
  /** Anzahl Rückfälle (Lapses). */
  lapses: number;
  /** ISO-Datum (UTC) der nächsten Fälligkeit. */
  due: string;
  /** ISO-Zeitstempel der letzten Wiederholung, null wenn nie gelernt. */
  lastReviewed: string | null;
  /** Automatisch gesetzt, wenn die Karte als „schwierig“ gilt (Fehlerprotokoll). */
  leech: boolean;
}

export interface ReviewLog extends Syncable {
  cardId: string;
  contentRef: string;
  kind: CardKind;
  rating: ReviewRating;
  /** Antwortzeit in Millisekunden (für Speed-/Metakognitions-Auswertung). */
  durationMs: number;
  /** Intervall (Tage) NACH dieser Wiederholung. */
  scheduledInterval: number;
  reviewedAt: string;
}

export type ExamFormat =
  | 'vocab_ar_de'
  | 'vocab_de_ar'
  | 'plural'
  | 'root'
  | 'conjugation'
  | 'listening'
  | 'reading'
  | 'writing'
  | 'speaking'
  | 'minimalpair'
  | 'mixed_chapter'
  | 'speed'
  | 'adaptive';

export interface ExamItemResult {
  contentRef: string;
  format: ExamFormat;
  prompt: string;
  expected: string;
  given: string;
  correct: boolean;
  durationMs: number;
}

export interface ExamResult extends Syncable {
  format: ExamFormat;
  /** Bei gemischten Kapitelprüfungen: einbezogene Einheiten. */
  units: number[];
  score: number;
  total: number;
  items: ExamItemResult[];
  startedAt: string;
  finishedAt: string;
}

/** Frei erweiterbarer Einstellungsspeicher (ein Datensatz pro Nutzer). */
export interface SettingsRecord extends Syncable {
  /** Singleton-Schlüssel, immer 'user-settings'. */
  key: 'user-settings';
  tashkilLevel: TashkilLevel;
  theme: 'dark' | 'light';
  arabicFontScale: number;
  dailyGoal: number;
  showTransliteration: boolean;
  dialectNotes: boolean;
}

export type TashkilLevel = 'full' | 'partial' | 'none';

/**
 * Nutzererstellte Inhalte (eigene Vokabeln). Werden – anders als die statischen
 * Lehrinhalte – synchronisiert, weil sie pro Nutzer entstehen.
 */
export interface UserVocab extends Syncable {
  ar: string;
  tr: string;
  de: string;
  wurzel: string;
  wazn?: string;
  plural?: string | null;
  einheit: number;
  hinweis?: string;
}

/** Eine Tabelle, die synchronisiert wird. */
export type SyncTable =
  | 'srs_cards'
  | 'review_logs'
  | 'exam_results'
  | 'settings'
  | 'user_vocab';
