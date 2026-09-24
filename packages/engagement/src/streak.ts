/**
 * Daily streak with shields, and the weekly goal (engagement plan §3). A day counts when at
 * least one daily quest was done on it (days in the learner's time zone). Rest days are
 * allowed: every 7 active days earn a shield (at most 2), which covers a missed day
 * automatically. The weekly goal (3, 5 or 7 active days) is kept even with missed days.
 */
import { addDays, daysBetween, weekStart } from './day.js';

export const SHIELD_EVERY_DAYS = 7;
export const MAX_SHIELDS = 2;
export const WEEKLY_GOALS = [3, 5, 7] as const;
export type WeeklyGoal = (typeof WEEKLY_GOALS)[number];
export const DEFAULT_WEEKLY_GOAL: WeeklyGoal = 5;

export interface Streak {
  /** Days in a row up to today (today counts once it is active). */
  current: number;
  longest: number;
  /** Shields ready for the next missed day. */
  shields: number;
  /** Missed days a shield covered. */
  shieldedDays: string[];
  activeToday: boolean;
  /** reachedOn[n - 1] = the first day a streak of n days was reached. */
  reachedOn: string[];
}

export function computeStreak(activeDays: ReadonlySet<string>, today: string): Streak {
  const sorted = [...activeDays].filter((d) => d <= today).sort();
  const first = sorted[0];
  const streak: Streak = {
    current: 0,
    longest: 0,
    shields: 0,
    shieldedDays: [],
    activeToday: activeDays.has(today),
    reachedOn: [],
  };
  if (first === undefined) return streak;
  let sinceShield = 0;
  for (let day = first; day <= today; day = addDays(day, 1)) {
    if (activeDays.has(day)) {
      streak.current++;
      sinceShield++;
      if (sinceShield === SHIELD_EVERY_DAYS) {
        streak.shields = Math.min(MAX_SHIELDS, streak.shields + 1);
        sinceShield = 0;
      }
      if (streak.current > streak.reachedOn.length) streak.reachedOn.push(day);
    } else if (day === today) {
      // Today is not over yet: the streak still stands.
    } else if (streak.shields > 0) {
      streak.shields--;
      streak.shieldedDays.push(day);
    } else {
      streak.current = 0;
      sinceShield = 0;
    }
  }
  streak.longest = streak.reachedOn.length;
  return streak;
}

export interface WeeklyProgress {
  goal: WeeklyGoal;
  /** Monday of the current week. */
  weekStart: string;
  /** Active days in the current week so far. */
  activeDays: number;
  met: boolean;
  /** Weeks in a row with the goal met, up to this week (it counts once met). */
  streak: number;
  /** For every week the goal was met: the day it was reached, in order. */
  metOn: string[];
}

export function weeklyProgress(
  activeDays: ReadonlySet<string>,
  goal: WeeklyGoal,
  today: string
): WeeklyProgress {
  const byWeek = new Map<string, string[]>();
  for (const day of [...activeDays].filter((d) => d <= today).sort()) {
    const week = weekStart(day);
    byWeek.set(week, [...(byWeek.get(week) ?? []), day]);
  }
  const metOn = [...byWeek.values()]
    .filter((days) => days.length >= goal)
    .map((days) => days[goal - 1] as string);
  const metWeeks = new Set(metOn.map(weekStart));
  const current = weekStart(today);
  const met = metWeeks.has(current);
  // An unfinished current week does not break the streak.
  let week = met ? current : addDays(current, -7);
  let streak = 0;
  while (metWeeks.has(week)) {
    streak++;
    week = addDays(week, -7);
  }
  return {
    goal,
    weekStart: current,
    activeDays: byWeek.get(current)?.length ?? 0,
    met,
    streak,
    metOn,
  };
}

/** Is this a weekly goal the app offers? */
export function isWeeklyGoal(value: unknown): value is WeeklyGoal {
  return WEEKLY_GOALS.includes(value as WeeklyGoal);
}

/** Days left in the week after `today` (Sunday → 0). */
export function daysLeftInWeek(today: string): number {
  return 6 - daysBetween(weekStart(today), today);
}
