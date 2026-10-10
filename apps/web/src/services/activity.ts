/**
 * Learning activity per day for the dashboard heatmap: card reviews, unit practice (reading,
 * writing, speaking, grammar, gaps, verbs, tutor) and finished tracks and videos. Days are the
 * learner's own (account or device time zone), the same days the streak and quests count.
 */
import { addDays, dayKey, ticksByDay, type EngagementInput } from '@suffa/engagement';

export interface ActivityCell {
  date: string;
  total: number;
  reviews: number;
  practice: number;
  tracks: number;
}

export function activityHeatmap(
  input: Pick<EngagementInput, 'reviews' | 'tracks' | 'practice'>,
  timeZone: string,
  days = 28,
  now: Date = new Date()
): ActivityCell[] {
  const byDay = ticksByDay(input, timeZone);
  const today = dayKey(now, timeZone);
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i - (days - 1));
    const cell: ActivityCell = { date, total: 0, reviews: 0, practice: 0, tracks: 0 };
    for (const tick of byDay.get(date) ?? []) {
      cell.total++;
      if (tick.kind === 'review') cell.reviews++;
      else if (tick.kind === 'practice') cell.practice++;
      else cell.tracks++;
    }
    return cell;
  });
}
