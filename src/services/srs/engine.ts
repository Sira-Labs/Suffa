/**
 * SRS-Scheduling-Engine (SM-2-Stil mit FSRS-nahen Anpassungen).
 *
 * Designentscheidungen (siehe ADR-0001):
 *  - SM-2 als Basis: robust, offline berechenbar, gut verstanden.
 *  - 4-stufige Bewertung (again/hard/good/easy) statt 0–5, näher an Anki/FSRS.
 *  - „again“ ist ein Lapse: Intervall-Reset + Ease-Strafe; Karte wird ggf. Leech.
 *  - Erste beiden erfolgreichen Reps: feste Lernintervalle (1 Tag, dann 6 Tage).
 *  - Alle Zeitrechnungen in UTC; `due` ist ein ISO-Datum (Tagesauflösung).
 */
import type { ReviewRating, SrsCard } from '@/types';

export const MIN_EASE = 1.3;
export const DEFAULT_EASE = 2.5;
export const LEECH_LAPSE_THRESHOLD = 4;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface NewCardInput {
  id: string;
  contentRef: string;
  kind: SrsCard['kind'];
  now?: Date;
}

/** Erzeugt eine frische, sofort fällige Karte. */
export function createCard(input: NewCardInput): SrsCard {
  const now = input.now ?? new Date();
  const iso = now.toISOString();
  return {
    id: input.id,
    contentRef: input.contentRef,
    kind: input.kind,
    interval: 0,
    ease: DEFAULT_EASE,
    reps: 0,
    lapses: 0,
    due: iso,
    lastReviewed: null,
    leech: false,
    updated_at: iso,
    deleted: false,
  };
}

/** Ease-Anpassung pro Bewertung (SM-2-inspiriert). */
function nextEase(ease: number, rating: ReviewRating): number {
  let delta = 0;
  switch (rating) {
    case 'again':
      delta = -0.2;
      break;
    case 'hard':
      delta = -0.15;
      break;
    case 'good':
      delta = 0;
      break;
    case 'easy':
      delta = 0.15;
      break;
  }
  return Math.max(MIN_EASE, Number((ease + delta).toFixed(4)));
}

export interface ScheduleOptions {
  now?: Date;
  /** Zufalls-Streuung (±%) gegen „Karten-Stau“ am selben Tag. 0 = deterministisch. */
  fuzz?: number;
}

/**
 * Berechnet den neuen Kartenzustand nach einer Bewertung.
 * Reine Funktion (kein Seiteneffekt) – dadurch leicht testbar.
 */
export function schedule(
  card: SrsCard,
  rating: ReviewRating,
  options: ScheduleOptions = {}
): SrsCard {
  const now = options.now ?? new Date();
  const fuzz = options.fuzz ?? 0;
  const ease = nextEase(card.ease, rating);

  let interval: number;
  let reps = card.reps;
  let lapses = card.lapses;

  if (rating === 'again') {
    // Lapse: zurück in die Lernphase.
    reps = 0;
    lapses += 1;
    interval = 0; // erneut heute fällig (Lernschritt)
  } else if (card.reps === 0) {
    reps = 1;
    interval = rating === 'easy' ? 4 : 1;
  } else if (card.reps === 1) {
    reps = 2;
    interval = rating === 'easy' ? 7 : 6;
  } else {
    reps = card.reps + 1;
    const hardFactor = 1.2;
    const easyBonus = 1.3;
    const base = card.interval > 0 ? card.interval : 1;
    if (rating === 'hard') {
      interval = Math.round(base * hardFactor);
    } else if (rating === 'easy') {
      interval = Math.round(base * ease * easyBonus);
    } else {
      interval = Math.round(base * ease);
    }
  }

  if (fuzz > 0 && interval >= 2) {
    const spread = interval * fuzz;
    const jitter = (Math.random() * 2 - 1) * spread;
    interval = Math.max(1, Math.round(interval + jitter));
  }

  const due = new Date(now.getTime() + interval * DAY_MS);
  const iso = now.toISOString();
  const leech = lapses >= LEECH_LAPSE_THRESHOLD;

  return {
    ...card,
    ease,
    reps,
    lapses,
    interval,
    due: interval === 0 ? iso : startOfDayIso(due),
    lastReviewed: iso,
    leech: card.leech || leech,
    updated_at: iso,
  };
}

/** Normiert ein Datum auf Tagesbeginn (UTC) als ISO-String. */
export function startOfDayIso(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  return d.toISOString();
}

/** Ist die Karte zum Stichtag fällig? */
export function isDue(card: SrsCard, now: Date = new Date()): boolean {
  if (card.deleted) return false;
  return new Date(card.due).getTime() <= now.getTime();
}

/**
 * Vorschau der nächsten Intervalle für die 4 Buttons (UI-Hinweis „in X Tagen“).
 */
export function previewIntervals(
  card: SrsCard,
  now: Date = new Date()
): Record<ReviewRating, number> {
  const ratings: ReviewRating[] = ['again', 'hard', 'good', 'easy'];
  const result = {} as Record<ReviewRating, number>;
  for (const r of ratings) {
    result[r] = schedule(card, r, { now, fuzz: 0 }).interval;
  }
  return result;
}
