import type { Syncable } from './srs';

/**
 * The daily check-in: the learner confirms the word of the day once per local day. XP is
 * derived from these records (engagement rules), never stored.
 */
export interface DailyCheckIn extends Syncable {
  /** Local day, `YYYY-MM-DD`. */
  id: string;
  wordId: string;
  checkedAt: string;
}
