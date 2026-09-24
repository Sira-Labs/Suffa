/**
 * Everything the app shows about progress, computed in one pass from the learning records:
 * XP (with quest XP), level, today's quests, streak, weekly goal and badges. The app runs it
 * right after an action (offline); the server runs the same function on synced data.
 */
import { evaluateAchievements, type Unlock } from './achievements.js';
import { addDays, dayKey, weekStart } from './day.js';
import { levelFor, type Level } from './levels.js';
import {
  evaluateDay,
  questXpEvents,
  ticksByDay,
  type DayQuests,
  type Tick,
} from './quests.js';
import type { EngagementInput } from './records.js';
import {
  computeStreak,
  weeklyProgress,
  type Streak,
  type WeeklyGoal,
  type WeeklyProgress,
} from './streak.js';
import {
  checkInXpEvents,
  listeningXpEvents,
  practiceXpEvents,
  reviewXpEvents,
  stageXpEvents,
  sumXpBetween,
  totalXp,
  unitOnTimeXpEvents,
  type XpEvent,
} from './xp.js';

export interface SummaryOptions {
  timeZone: string;
  weeklyGoal: WeeklyGoal;
  now?: Date;
}

export interface EngagementSummary {
  today: string;
  xpEvents: XpEvent[];
  totalXp: number;
  weekXp: number;
  todayXp: number;
  level: Level;
  quests: DayQuests;
  /** Quest results of every day with activity (for the server's quest_progress). */
  questDays: DayQuests[];
  streak: Streak;
  weekly: WeeklyProgress;
  achievements: Unlock[];
}

export function summarize(
  input: EngagementInput,
  { timeZone, weeklyGoal, now = new Date() }: SummaryOptions
): EngagementSummary {
  const today = dayKey(now, timeZone);
  const ticks = ticksByDay(input, timeZone);
  const questDays = [...ticks.keys()]
    .filter((day) => day <= today)
    .sort()
    .map((day) => evaluateDay(day, ticks.get(day) as Tick[]));
  const quests =
    questDays.find((d) => d.day === today) ?? evaluateDay(today, ticks.get(today) ?? []);
  const activeDays = new Set(
    questDays.filter((d) => d.quests.some((q) => q.done)).map((d) => d.day)
  );
  const streak = computeStreak(activeDays, today);
  const weekly = weeklyProgress(activeDays, weeklyGoal, today);
  const xpEvents = [
    ...reviewXpEvents(input.reviews, timeZone),
    ...listeningXpEvents(input.tracks, input.lessonSizes),
    ...practiceXpEvents(input.practice),
    ...unitOnTimeXpEvents(input.enrollments, input.exams),
    ...stageXpEvents(input.exams),
    ...checkInXpEvents(input.checkIns),
    ...questXpEvents(questDays),
  ]
    .filter((e) => dayKey(e.at, timeZone) <= today)
    .sort((a, b) => a.at.localeCompare(b.at));
  const total = totalXp(xpEvents);
  const achievements = evaluateAchievements(
    input,
    {
      streakReachedOn: streak.reachedOn,
      weeklyGoalsMetOn: weekly.metOn,
      allQuestsOn: questDays.filter((d) => d.bonusAt).map((d) => d.day),
    },
    timeZone
  );
  return {
    today,
    xpEvents,
    totalXp: total,
    weekXp: sumXpBetween(xpEvents, weekStart(today), today, timeZone),
    todayXp: sumXpBetween(xpEvents, today, today, timeZone),
    level: levelFor(total),
    quests,
    questDays,
    streak,
    weekly,
    achievements,
  };
}

/** The last `n` days up to `today`, oldest first (for week strips). */
export function lastDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
}
