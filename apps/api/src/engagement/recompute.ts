/**
 * Recomputes one learner's engagement on the server (story 5.4): the synced records pass the
 * plausibility checks, then the same rules as in the app derive XP, quests and badges.
 */
import { RULES_VERSION, summarize, type QuestFeatures } from '@suffa/engagement';
import type { Logger } from 'pino';
import { filterPlausible } from './plausibility.js';
import type { EngagementRepository } from './repository.js';

export async function recomputeEngagement(
  repo: EngagementRepository,
  userId: string,
  log: Pick<Logger, 'info'>,
  now: Date = new Date(),
  features: QuestFeatures = {}
): Promise<boolean> {
  const data = await repo.load(userId);
  // The account was deleted between push and job: nothing to do.
  if (!data) return false;
  const { input, rejected } = filterPlausible(data.input, now);
  const summary = summarize(input, {
    timeZone: data.timeZone,
    weeklyGoal: data.weeklyGoal,
    now,
    features,
  });
  const rejectedCount = Object.values(rejected).reduce((n, c) => n + c, 0);
  await repo.save(userId, summary, {
    rulesVersion: RULES_VERSION,
    rejected: rejectedCount,
    computedAt: now,
  });
  log.info(
    { userId, totalXp: summary.totalXp, rejected, rulesVersion: RULES_VERSION },
    'engagement.recomputed'
  );
  return true;
}
