/**
 * "Heute": today's learning path and the word of the day, derived from local data only
 * (works offline). Pure functions, so the dashboard stays a thin view.
 */
import type { ReviewLog, Vokabel } from '@/types';

export type StepState = 'done' | 'current' | 'upcoming';

export interface TodayStep {
  id: 'review' | 'new' | 'listen';
  /** Learner-facing (German). */
  label: string;
  detail: string;
  to: string;
  state: StepState;
}

export interface TodayInput {
  dueCount: number;
  newCount: number;
  leechCount: number;
  dailyGoal: number;
  /** Reviews logged today. */
  reviewedToday: number;
  /** Cards whose first review ever happened today. */
  newLearnedToday: number;
  /** Audio tracks that counted as heard today. */
  heardToday?: number;
}

export const REVIEW_PATH = '/review';

/** New words suggested per day (small, so reviews stay manageable). */
export const NEW_PER_DAY = 5;
/** Minutes per card, for the time estimate shown on "Heute". */
const MINUTES_PER_CARD = 0.4;
const LISTEN_MINUTES = 3;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Three steps: review what is due, learn a few new words, listen to a dialogue.
 * The first step that is not done becomes "current".
 */
export function buildTodayPlan(input: TodayInput): {
  steps: TodayStep[];
  minutes: number;
} {
  const newToday = Math.max(0, Math.min(input.newCount, NEW_PER_DAY, input.dailyGoal));
  // Nothing due counts as done; the detail line tells "done today" from "nothing due".
  const done: Record<TodayStep['id'], boolean> = {
    review: input.dueCount === 0,
    new: newToday === 0 || input.newLearnedToday >= NEW_PER_DAY,
    listen: (input.heardToday ?? 0) > 0,
  };

  const steps: Omit<TodayStep, 'state'>[] = [
    {
      id: 'review',
      label:
        input.dueCount > 0
          ? `${plural(input.dueCount, 'Karte', 'Karten')} wiederholen`
          : 'Wiederholen',
      detail:
        input.dueCount === 0
          ? input.reviewedToday > 0
            ? 'Für heute erledigt'
            : 'Heute nichts fällig'
          : input.leechCount > 0
            ? `davon ${plural(input.leechCount, 'schwieriges Wort', 'schwierige Wörter')}`
            : 'aus deinen Einheiten',
      to: REVIEW_PATH,
    },
    {
      id: 'new',
      label:
        newToday > 0 ? `${plural(newToday, 'neues Wort', 'neue Wörter')}` : 'Neue Wörter',
      detail: newToday > 0 ? 'mit Aussprache und Wurzel' : 'Alle Wörter sind gestartet',
      to: REVIEW_PATH,
    },
    {
      id: 'listen',
      label: 'Dialog hören',
      detail:
        (input.heardToday ?? 0) > 0
          ? `${plural(input.heardToday!, 'Aufnahme', 'Aufnahmen')} gehört`
          : 'Offizielles Audio zum Buch',
      to: '/library',
    },
  ];

  let currentAssigned = false;
  const withState = steps.map((step) => {
    let state: StepState = 'upcoming';
    if (done[step.id]) state = 'done';
    else if (!currentAssigned) {
      state = 'current';
      currentAssigned = true;
    }
    return { ...step, state };
  });

  const minutes = Math.max(
    1,
    Math.round((input.dueCount + newToday) * MINUTES_PER_CARD + LISTEN_MINUTES)
  );
  return { steps: withState, minutes };
}

/** Local calendar day (YYYY-MM-DD) of a timestamp. */
export function localDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Today's reviews, and how many cards were reviewed for the very first time today. */
export function reviewsToday(logs: ReviewLog[], now: Date = new Date()) {
  const today = localDay(now);
  const todays = logs.filter(
    (l) => !l.deleted && localDay(new Date(l.reviewedAt)) === today
  );
  const firstSeen = new Map<string, string>();
  for (const log of [...logs].sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt))) {
    if (!firstSeen.has(log.cardId))
      firstSeen.set(log.cardId, localDay(new Date(log.reviewedAt)));
  }
  const newLearned = new Set(
    todays.filter((l) => firstSeen.get(l.cardId) === today).map((l) => l.cardId)
  ).size;
  return { reviewed: todays.length, newLearned };
}

/** Deterministic word of the day: the same word for everyone on the same day. */
export function wordOfTheDay(words: Vokabel[], now: Date = new Date()): Vokabel | null {
  if (words.length === 0) return null;
  const day = localDay(now);
  let hash = 0;
  for (const ch of day) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const sorted = [...words].sort((a, b) => a.id.localeCompare(b.id));
  return sorted[hash % sorted.length] ?? null;
}
