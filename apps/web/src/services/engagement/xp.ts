/**
 * XP rules v1 (docs/plan/engagement-plan.md §2, ADR-0016): pure functions over data we
 * already store, so the same rules can later run on the server as the authoritative copy.
 * XP rewards effortful recall and finished listening, not raw volume.
 */
import type {
  ExamResult,
  MediaProgress,
  PracticeRecord,
  ReviewLog,
  ReviewRating,
  UnitEnrollment,
} from '@/types';
import { enrollmentStatus } from '@/services/enrollment';
import { localDay } from '@/services/today';

export const XP_RULES = {
  review: { again: 0, hard: 1, good: 2, easy: 2 } satisfies Record<ReviewRating, number>,
  /** First successful review of a card ever. */
  newCardLearned: 3,
  /** Soft cap on review XP per day (reviews only). */
  reviewDailyCap: 150,
  /** One audio track heard (≥ 85 % actually played). */
  trackHeard: 5,
  /** Bonus when every track of a lesson is heard. */
  lessonComplete: 15,
  /** First success with an item of a unit skill (read, write, speak, verbs). */
  itemPractised: 2,
  /** Unit test passed by the unit's target date (soft deadline: late only loses this). */
  unitOnTime: 50,
} as const;

/** Share of a track that must actually be played to count as heard. */
export const HEARD_THRESHOLD = 0.85;

export interface XpEvent {
  at: string;
  points: number;
  kind: 'review' | 'new-card' | 'track' | 'lesson' | 'practice' | 'unit-on-time';
  ref: string;
}

/** XP events from reviews, respecting the daily soft cap. */
export function reviewXpEvents(logs: ReviewLog[]): XpEvent[] {
  const sorted = [...logs]
    .filter((l) => !l.deleted)
    .sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
  const learned = new Set<string>();
  const perDay = new Map<string, number>();
  const events: XpEvent[] = [];
  for (const log of sorted) {
    const day = localDay(new Date(log.reviewedAt));
    const soFar = perDay.get(day) ?? 0;
    const base = XP_RULES.review[log.rating];
    const points = Math.min(base, Math.max(0, XP_RULES.reviewDailyCap - soFar));
    if (points > 0) {
      perDay.set(day, soFar + points);
      events.push({ at: log.reviewedAt, points, kind: 'review', ref: log.cardId });
    }
    const success = log.rating === 'good' || log.rating === 'easy';
    if (success && !learned.has(log.cardId)) {
      learned.add(log.cardId);
      events.push({
        at: log.reviewedAt,
        points: XP_RULES.newCardLearned,
        kind: 'new-card',
        ref: log.cardId,
      });
    }
  }
  return events;
}

/**
 * XP events from listening: one per heard track, plus a lesson bonus at the moment the last
 * track of a lesson was heard. `lessonSizes` maps lessonKey → number of tracks in it.
 */
export function listeningXpEvents(
  progress: MediaProgress[],
  lessonSizes: ReadonlyMap<string, number>
): XpEvent[] {
  const heard = progress.filter((p) => !p.deleted && p.completedAt);
  const events: XpEvent[] = heard.map((p) => ({
    at: p.completedAt!,
    points: XP_RULES.trackHeard,
    kind: 'track',
    ref: p.id,
  }));
  const byLesson = new Map<string, MediaProgress[]>();
  for (const p of heard)
    byLesson.set(p.lessonKey, [...(byLesson.get(p.lessonKey) ?? []), p]);
  for (const [lessonKey, tracks] of byLesson) {
    const size = lessonSizes.get(lessonKey);
    if (!size || tracks.length < size) continue;
    const at = tracks
      .map((t) => t.completedAt!)
      .sort()
      .at(-1)!;
    events.push({ at, points: XP_RULES.lessonComplete, kind: 'lesson', ref: lessonKey });
  }
  return events;
}

/** XP events from unit practice: one per item first practised successfully. */
export function practiceXpEvents(records: PracticeRecord[]): XpEvent[] {
  return records
    .filter((r) => !r.deleted)
    .map((r) => ({
      at: r.practisedAt,
      points: XP_RULES.itemPractised,
      kind: 'practice' as const,
      ref: r.id,
    }));
}

/** On-time bonus per started unit whose test was passed by its target date. */
export function unitOnTimeXpEvents(
  enrollments: UnitEnrollment[],
  exams: ExamResult[]
): XpEvent[] {
  return enrollments.flatMap((e) => {
    const status = enrollmentStatus(e, exams, e.unit);
    if (status.state !== 'completed' || !status.onTime) return [];
    return [
      {
        at: status.passedAt.toISOString(),
        points: XP_RULES.unitOnTime,
        kind: 'unit-on-time' as const,
        ref: e.id,
      },
    ];
  });
}

/** Sum of XP within [from, now]. */
export function sumXp(events: XpEvent[], from: Date, now: Date = new Date()): number {
  const lo = from.getTime();
  const hi = now.getTime();
  return events
    .filter((e) => {
      const t = Date.parse(e.at);
      return t >= lo && t <= hi;
    })
    .reduce((sum, e) => sum + e.points, 0);
}

/** Monday 00:00 local time of the current week (German week start). */
export function startOfWeek(now: Date = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}
