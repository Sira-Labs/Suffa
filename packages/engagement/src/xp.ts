/**
 * XP rules v1 (docs/plan/engagement-plan.md §2): pure functions over records that are
 * already synced, so the device (instantly, offline) and the server (authoritatively) compute
 * the same numbers. XP rewards effortful recall and finished listening, not raw volume.
 */
import { dayKey } from './day.js';
import type {
  CheckInEntry,
  EnrollmentEntry,
  ExamEntry,
  PracticeEntry,
  Rating,
  ReviewEntry,
  TrackEntry,
} from './records.js';
import { STAGES, enrollmentStatus, stageTestPassed } from './units.js';

/** Bump when a weight changes: the server then recomputes every ledger. */
export const RULES_VERSION = 1;

export const XP_RULES = {
  review: { again: 0, hard: 1, good: 2, easy: 2 } satisfies Record<Rating, number>,
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
  /** Daily check-in with the word of the day (once per local day). */
  dailyCheckIn: 10,
  /** Unit test passed by the unit's target date (soft deadline: late only loses this). */
  unitOnTime: 50,
  /** Stage test passed (units 1–8 or 9–16 of a book). */
  stageComplete: 250,
} as const;

/** Share of a track that must actually be played to count as heard. */
export const HEARD_THRESHOLD = 0.85;

export type XpKind =
  | 'review'
  | 'new-card'
  | 'track'
  | 'lesson'
  | 'practice'
  | 'unit-on-time'
  | 'stage'
  | 'checkin'
  | 'quest'
  | 'quest-bonus';

export interface XpEvent {
  at: string;
  points: number;
  kind: XpKind;
  /** What earned it; `${kind}:${ref}` is unique per learner (the server's ledger key). */
  ref: string;
}

const live = <T extends { deleted?: boolean }>(records: readonly T[]) =>
  records.filter((r) => !r.deleted);

/** XP events from reviews, respecting the daily soft cap (days in `timeZone`). */
export function reviewXpEvents(
  logs: readonly ReviewEntry[],
  timeZone: string
): XpEvent[] {
  const sorted = live(logs).sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
  const learned = new Set<string>();
  const perDay = new Map<string, number>();
  const events: XpEvent[] = [];
  for (const log of sorted) {
    const day = dayKey(log.reviewedAt, timeZone);
    const soFar = perDay.get(day) ?? 0;
    const points = Math.min(XP_RULES.review[log.rating], XP_RULES.reviewDailyCap - soFar);
    if (points > 0) {
      perDay.set(day, soFar + points);
      events.push({
        at: log.reviewedAt,
        points,
        kind: 'review',
        ref: `${log.cardId}@${log.reviewedAt}`,
      });
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
 * track of a lesson was heard.
 */
export function listeningXpEvents(
  progress: readonly TrackEntry[],
  lessonSizes: ReadonlyMap<string, number>
): XpEvent[] {
  const heard = live(progress).filter(
    (p): p is TrackEntry & { completedAt: string } => p.completedAt !== null
  );
  const events: XpEvent[] = heard.map((p) => ({
    at: p.completedAt,
    points: XP_RULES.trackHeard,
    kind: 'track',
    ref: p.id,
  }));
  const byLesson = new Map<string, string[]>();
  for (const p of heard) {
    byLesson.set(p.lessonKey, [...(byLesson.get(p.lessonKey) ?? []), p.completedAt]);
  }
  for (const [lessonKey, times] of byLesson) {
    const size = lessonSizes.get(lessonKey);
    if (!size || times.length < size) continue;
    const at = times.sort().at(-1) as string;
    events.push({ at, points: XP_RULES.lessonComplete, kind: 'lesson', ref: lessonKey });
  }
  return events;
}

/** XP events from unit practice: one per item first practised successfully. */
export function practiceXpEvents(records: readonly PracticeEntry[]): XpEvent[] {
  return live(records).map((r) => ({
    at: r.practisedAt,
    points: XP_RULES.itemPractised,
    kind: 'practice' as const,
    ref: r.id,
  }));
}

/** On-time bonus per started unit whose test was passed by its target date. */
export function unitOnTimeXpEvents(
  enrollments: readonly EnrollmentEntry[],
  exams: readonly ExamEntry[]
): XpEvent[] {
  return live(enrollments).flatMap((e) => {
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

/** XP events from daily check-ins: one per day. */
export function checkInXpEvents(checkIns: readonly CheckInEntry[]): XpEvent[] {
  return live(checkIns).map((c) => ({
    at: c.checkedAt,
    points: XP_RULES.dailyCheckIn,
    kind: 'checkin' as const,
    ref: c.id,
  }));
}

/** Stage bonus: once per stage, at its first passing stage test. */
export function stageXpEvents(exams: readonly ExamEntry[]): XpEvent[] {
  return STAGES.flatMap((stage) => {
    const passed = stageTestPassed(exams, stage);
    return passed
      ? [
          {
            at: passed.finishedAt,
            points: XP_RULES.stageComplete,
            kind: 'stage' as const,
            ref: `stage-${stage.id}`,
          },
        ]
      : [];
  });
}

/** Sum of XP of the events whose local day lies in [fromDay, toDay]. */
export function sumXpBetween(
  events: readonly XpEvent[],
  fromDay: string,
  toDay: string,
  timeZone: string
): number {
  return events
    .filter((e) => {
      const day = dayKey(e.at, timeZone);
      return day >= fromDay && day <= toDay;
    })
    .reduce((sum, e) => sum + e.points, 0);
}

/** Sum of all XP. */
export function totalXp(events: readonly XpEvent[]): number {
  return events.reduce((sum, e) => sum + e.points, 0);
}
