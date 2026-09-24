/**
 * Learning metrics for dashboard/metacognition: mastery, streak,
 * forgetting curve and heatmap. Pure functions over cards + review logs.
 */
import type { ReviewLog, SrsCard } from '@/types';

export interface MasteryBuckets {
  neu: number;
  lernend: number;
  reif: number; // interval >= 21 days
  schwierig: number; // Leech
  total: number;
}

export function masteryBuckets(cards: SrsCard[]): MasteryBuckets {
  const result: MasteryBuckets = { neu: 0, lernend: 0, reif: 0, schwierig: 0, total: 0 };
  for (const c of cards) {
    if (c.deleted) continue;
    result.total++;
    if (c.leech) result.schwierig++;
    if (c.reps === 0) result.neu++;
    else if (c.interval >= 21) result.reif++;
    else result.lernend++;
  }
  return result;
}

/**
 * Wobbly cards: the learner's last answer was "Nochmal" or "Schwer", or the card is a leech
 * (forgotten LEECH_LAPSE_THRESHOLD times). Newest first, so the dashboard can list them.
 */
export function weakCards(cards: SrsCard[], logs: ReviewLog[]): SrsCard[] {
  const last = new Map<string, ReviewLog>();
  for (const log of logs) {
    const seen = last.get(log.cardId);
    if (!seen || log.reviewedAt > seen.reviewedAt) last.set(log.cardId, log);
  }
  return cards
    .filter((c) => {
      if (c.deleted) return false;
      const rating = last.get(c.id)?.rating;
      return c.leech || rating === 'again' || rating === 'hard';
    })
    .sort((a, b) =>
      (last.get(b.id)?.reviewedAt ?? '').localeCompare(last.get(a.id)?.reviewedAt ?? '')
    );
}

/** Day-based streak (consecutive days with at least one review). */
export function computeStreak(logs: ReviewLog[], now: Date = new Date()): number {
  if (logs.length === 0) return 0;
  const days = new Set(logs.map((l) => l.reviewedAt.slice(0, 10)));
  let streak = 0;
  const cursor = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  // Today only counts once studied; otherwise count from yesterday.
  if (!days.has(cursor.toISOString().slice(0, 10))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export interface ForgettingPoint {
  /** Days since the last review. */
  day: number;
  /** Modelled retention probability 0..1. */
  retention: number;
}

/**
 * Ebbinghaus forgetting curve: R = e^(-t/S), where stability S is estimated from
 * the average current interval of the mature cards.
 * The curve thus shows how fast the current material fades without review.
 */
export function forgettingCurve(cards: SrsCard[], points = 14): ForgettingPoint[] {
  const active = cards.filter((c) => !c.deleted && c.reps > 0 && c.interval > 0);
  const avgInterval =
    active.length > 0
      ? active.reduce((sum, c) => sum + c.interval, 0) / active.length
      : 1;
  const stability = Math.max(1, avgInterval);
  return Array.from({ length: points + 1 }, (_, day) => ({
    day,
    retention: Number(Math.exp(-day / stability).toFixed(3)),
  }));
}

/** Whole local calendar days since the last review, or null when there was none yet. */
export function daysSinceLastReview(
  logs: ReviewLog[],
  now: Date = new Date()
): number | null {
  const times = logs.filter((l) => !l.deleted).map((l) => Date.parse(l.reviewedAt));
  if (times.length === 0) return null;
  const last = new Date(Math.max(...times));
  const startOf = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOf(now) - startOf(last)) / 86_400_000);
}

/**
 * The forgetting reminder shows only after a break: the learner has reviewed before, but not
 * today and not yesterday (the streak is broken).
 */
export function isStreakBroken(logs: ReviewLog[], now: Date = new Date()): boolean {
  const days = daysSinceLastReview(logs, now);
  return days !== null && days >= 2;
}

export interface HeatCell {
  date: string;
  count: number;
}

/** Review count per day over the last `days` days (for the heatmap). */
export function reviewHeatmap(
  logs: ReviewLog[],
  days = 28,
  now: Date = new Date()
): HeatCell[] {
  const counts = new Map<string, number>();
  for (const l of logs) {
    const key = l.reviewedAt.slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const cells: HeatCell[] = [];
  const cursor = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  cursor.setUTCDate(cursor.getUTCDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const key = cursor.toISOString().slice(0, 10);
    cells.push({ date: key, count: counts.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return cells;
}

export interface NextRecommendation {
  text: string;
  to: string;
}

/** "What next?" recommendation from the current state. */
export function nextRecommendation(
  dueCount: number,
  newCount: number,
  leechCount: number
): NextRecommendation {
  if (leechCount > 0) {
    return {
      text: `Du hast ${leechCount} schwierige Wörter – gezielt üben.`,
      to: '/vocab',
    };
  }
  if (dueCount > 0) {
    return { text: `${dueCount} Karten sind fällig – jetzt wiederholen.`, to: '/vocab' };
  }
  if (newCount > 0) {
    return { text: `Alles wiederholt! ${newCount} neue Karten warten.`, to: '/vocab' };
  }
  return { text: 'Alles erledigt – probier eine Kapitelprüfung.', to: '/exam' };
}
