/**
 * "Heute": the word of the day and today's review counts, derived from local data only
 * (works offline). Pure functions, so the dashboard stays a thin view. Today's plan itself
 * is the daily quests (TodayQuests).
 */
import type { ReviewLog, Vokabel } from '@/types';

/** New words suggested per day (small, so reviews stay manageable). */
export const NEW_PER_DAY = 5;

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
