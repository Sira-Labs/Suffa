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
