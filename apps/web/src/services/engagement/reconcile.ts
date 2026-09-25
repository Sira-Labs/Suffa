/**
 * The app computes engagement instantly on the device; the server recomputes it from the
 * synced data with plausibility checks (story 5.4). Once everything is uploaded and the
 * server has caught up, its totals win silently. Badges the server knows are always shown
 * (they survive a reinstall even before the local history is back).
 */
import {
  levelFor,
  type EngagementSummary,
  type Tier,
  type Unlock,
} from '@suffa/engagement';
import type { ServerEngagement } from '@/services/sync/ApiSyncProvider';

const TIERS: readonly Tier[] = ['bronze', 'silver', 'gold'];

export function reconcile(
  local: EngagementSummary,
  server: ServerEngagement | null,
  pendingUploads: number
): EngagementSummary {
  if (!server) return local;
  const newestLocal = local.xpEvents.at(-1)?.at ?? '';
  const serverIsCurrent = pendingUploads === 0 && server.computedAt >= newestLocal;
  const totalXp = serverIsCurrent ? server.totalXp : local.totalXp;

  const badges = local.badges.map((progress) => {
    const known = new Set(progress.unlocks.map((u) => u.tier));
    const extra: Unlock[] = server.achievements
      .filter((a) => a.badgeId === progress.badge.id && !known.has(a.tier))
      .map((a) => ({
        badgeId: a.badgeId,
        tier: a.tier,
        threshold: progress.badge.thresholds[TIERS.indexOf(a.tier)] ?? 1,
        unlockedAt: a.unlockedAt,
      }));
    if (extra.length === 0) return progress;
    const unlocks = [...progress.unlocks, ...extra].sort(
      (a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier)
    );
    return {
      ...progress,
      unlocks,
      next: progress.badge.thresholds[unlocks.length] ?? null,
    };
  });

  return {
    ...local,
    totalXp,
    level: levelFor(totalXp),
    badges,
    achievements: badges.flatMap((b) => b.unlocks),
  };
}
