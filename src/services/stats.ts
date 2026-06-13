/**
 * Lern-Metriken für Dashboard/Metakognition: Beherrschung, Streak,
 * Vergessenskurve und Heatmap. Reine Funktionen über Karten + Review-Logs.
 */
import type { ReviewLog, SrsCard } from '@/types';

export interface MasteryBuckets {
  neu: number;
  lernend: number;
  reif: number; // Intervall >= 21 Tage
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

/** Tagesgenaue Streak (aufeinanderfolgende Tage mit mindestens einer Review). */
export function computeStreak(logs: ReviewLog[], now: Date = new Date()): number {
  if (logs.length === 0) return 0;
  const days = new Set(logs.map((l) => l.reviewedAt.slice(0, 10)));
  let streak = 0;
  const cursor = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  // Heute zählt nur, wenn schon gelernt wurde; sonst ab gestern weiterzählen.
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
  /** Tage seit letzter Wiederholung. */
  day: number;
  /** Modellierte Behaltenswahrscheinlichkeit 0..1. */
  retention: number;
}

/**
 * Vergessenskurve nach Ebbinghaus: R = e^(-t/S), wobei die Stabilität S aus dem
 * durchschnittlichen aktuellen Intervall der reifen Karten geschätzt wird.
 * So zeigt die Kurve, wie schnell der aktuelle Stoff ohne Wiederholung verblasst.
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

/** Review-Anzahl pro Tag über die letzten `days` Tage (für Heatmap). */
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

/** „Was als Nächstes?“-Empfehlung aus dem aktuellen Zustand. */
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
