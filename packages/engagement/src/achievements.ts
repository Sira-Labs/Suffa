/**
 * Achievements v1 (engagement plan §4): badges with bronze, silver and gold tiers. Each is
 * derived from synced history and only ever grows (e.g. "words that became mature", not
 * "words mature now"), so a badge is never lost, also not after a reinstall.
 */
import { dayKey, localHour } from './day.js';
import type { EngagementInput } from './records.js';
import { STAGES, stageTestPassed } from './units.js';

export type Tier = 'bronze' | 'silver' | 'gold';
const TIERS: readonly Tier[] = ['bronze', 'silver', 'gold'];

/** A card counts as mature from this interval on (days). */
export const MATURE_INTERVAL_DAYS = 21;
/** Sessions before this local hour count as "early". */
export const EARLY_HOUR = 8;

export interface BadgeDef {
  id: string;
  /** Transliterated name, Arabic and German meaning. */
  name: string;
  arabic: string;
  meaning: string;
  /** What to do, with `{n}` for the tier's threshold (German). */
  rule: string;
  /** Thresholds for bronze, silver, gold; single-tier badges have one. */
  thresholds: readonly number[];
}

export const BADGES: readonly BadgeDef[] = [
  {
    id: 'mudawim',
    name: 'al-Mudāwim',
    arabic: 'المُداوِم',
    meaning: 'der Beständige',
    rule: '{n} Tage in Folge gelernt',
    thresholds: [7, 30, 100],
  },
  {
    id: 'talib',
    name: 'Ṭālib al-ʿIlm',
    arabic: 'طالِبُ العِلم',
    meaning: 'der Wissenssuchende',
    rule: '{n} Wochenziele erreicht',
    thresholds: [4, 12, 26],
  },
  {
    id: 'mujtahid',
    name: 'al-Mujtahid',
    arabic: 'المُجتَهِد',
    meaning: 'der Fleißige',
    rule: 'An {n} Tagen alle drei Tagesaufgaben geschafft',
    thresholds: [10, 50, 150],
  },
  {
    id: 'bukur',
    name: 'Bukūr',
    arabic: 'بُكور',
    meaning: 'Frühaufsteher',
    rule: 'An {n} Tagen vor 8 Uhr gelernt',
    thresholds: [10],
  },
  {
    id: 'hafiz',
    name: 'Ḥāfiẓ al-Kalimāt',
    arabic: 'حافِظ الكلمات',
    meaning: 'Bewahrer der Wörter',
    rule: '{n} Karten gefestigt (Abstand ≥ 21 Tage)',
    thresholds: [100, 500, 1000],
  },
  {
    id: 'mustami',
    name: 'al-Mustamiʿ',
    arabic: 'المُستَمِع',
    meaning: 'der Zuhörer',
    rule: '{n} Lektionen ganz gehört',
    thresholds: [5, 20, 50],
  },
  {
    id: 'khattat',
    name: 'al-Khaṭṭāṭ',
    arabic: 'الخَطّاط',
    meaning: 'der Schreiber',
    rule: '{n} Wörter richtig geschrieben',
    thresholds: [25, 100, 250],
  },
  {
    id: 'mutakallim',
    name: 'al-Mutakallim',
    arabic: 'المُتَكَلِّم',
    meaning: 'der Sprechende',
    rule: '{n} Sätze gesprochen',
    thresholds: [25, 100, 250],
  },
  {
    id: 'mutasarrif',
    name: 'al-Mutaṣarrif',
    arabic: 'المُتَصَرِّف',
    meaning: 'der Konjugierende',
    rule: '{n} Verben geübt',
    thresholds: [5, 15, 30],
  },
  {
    id: 'najm',
    name: 'Najm al-Imtiḥān',
    arabic: 'نَجم الامتحان',
    meaning: 'Stern der Prüfung',
    rule: '{n}× volle Punktzahl in einem Test',
    thresholds: [1, 5, 10],
  },
  {
    id: 'ruh',
    name: 'Rūḥ al-Faṣl',
    arabic: 'رُوح الفَصل',
    meaning: 'Klassengeist',
    rule: '{n} Klassen-Challenges mitgeschafft',
    thresholds: [1, 5, 10],
  },
  ...STAGES.map((stage) => ({
    id: `stage-${stage.id}`,
    name: stage.badge,
    arabic: stage.id === 1 ? 'حَجَر الأساس' : 'الكِتاب الأوَّل',
    meaning: `${stage.name} geschafft`,
    rule: `${stage.test} bestanden`,
    thresholds: [1],
  })),
];

export interface Unlock {
  badgeId: string;
  tier: Tier;
  /** Threshold of this tier. */
  threshold: number;
  unlockedAt: string;
}

/** Facts the badges are measured on; `*On` lists hold the instant or day of each step. */
export interface AchievementFacts {
  /** reachedOn[n - 1]: first day of an n-day streak. */
  streakReachedOn: readonly string[];
  weeklyGoalsMetOn: readonly string[];
  /** Days all three quests were done, in order. */
  allQuestsOn: readonly string[];
  /** Class challenges reached with the learner's help (known to the server only). */
  classChallengesOn?: readonly string[];
}

/** Instants at which each count went up by one, per badge. */
function steps(input: EngagementInput, facts: AchievementFacts, timeZone: string) {
  const mature = new Set<string>();
  const matureAt: string[] = [];
  const reviews = input.reviews
    .filter((r) => !r.deleted)
    .sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
  const earlyDays = new Set<string>();
  const earlyAt: string[] = [];
  const early = (at: string) => {
    const day = dayKey(at, timeZone);
    if (localHour(at, timeZone) < EARLY_HOUR && !earlyDays.has(day)) {
      earlyDays.add(day);
      earlyAt.push(at);
    }
  };
  for (const r of reviews) {
    if ((r.scheduledInterval ?? 0) >= MATURE_INTERVAL_DAYS && !mature.has(r.cardId)) {
      mature.add(r.cardId);
      matureAt.push(r.reviewedAt);
    }
    early(r.reviewedAt);
  }
  const practice = input.practice
    .filter((p) => !p.deleted)
    .sort((a, b) => a.practisedAt.localeCompare(b.practisedAt));
  for (const p of practice) early(p.practisedAt);
  const bySkill = (skill: string) =>
    practice.filter((p) => p.skill === skill).map((p) => p.practisedAt);

  const heard = new Map<string, string[]>();
  for (const t of input.tracks) {
    if (t.deleted || !t.completedAt) continue;
    heard.set(t.lessonKey, [...(heard.get(t.lessonKey) ?? []), t.completedAt]);
  }
  const lessonsAt = [...heard]
    .filter(([key, times]) => times.length >= (input.lessonSizes.get(key) ?? Infinity))
    .map(([, times]) => times.sort().at(-1) as string);

  const perfectAt = input.exams
    .filter((e) => !e.deleted && e.total > 0 && e.score === e.total)
    .map((e) => e.finishedAt);

  const result: Record<string, string[]> = {
    mudawim: [...facts.streakReachedOn],
    talib: [...facts.weeklyGoalsMetOn],
    mujtahid: [...facts.allQuestsOn],
    bukur: earlyAt.sort(),
    hafiz: matureAt,
    mustami: lessonsAt,
    khattat: bySkill('write'),
    mutakallim: bySkill('speak'),
    mutasarrif: bySkill('verbs'),
    najm: perfectAt,
    ruh: [...(facts.classChallengesOn ?? [])],
  };
  for (const stage of STAGES) {
    const passed = stageTestPassed(input.exams, stage);
    result[`stage-${stage.id}`] = passed ? [passed.finishedAt] : [];
  }
  for (const list of Object.values(result)) list.sort();
  return result;
}

/** A badge with how far the learner got: count, tiers reached, next threshold. */
export interface BadgeProgress {
  badge: BadgeDef;
  count: number;
  unlocks: Unlock[];
  /** Threshold of the next tier, or null when every tier is reached. */
  next: number | null;
}

/** Every badge with its progress (the gallery). */
export function badgeProgress(
  input: EngagementInput,
  facts: AchievementFacts,
  timeZone: string
): BadgeProgress[] {
  const measured = steps(input, facts, timeZone);
  return BADGES.map((badge) => {
    const times = measured[badge.id] as string[];
    const unlocks = badge.thresholds.flatMap((threshold, i) => {
      const at = times[threshold - 1];
      return at === undefined
        ? []
        : [{ badgeId: badge.id, tier: TIERS[i] as Tier, threshold, unlockedAt: at }];
    });
    return {
      badge,
      count: times.length,
      unlocks,
      next: badge.thresholds[unlocks.length] ?? null,
    };
  });
}

/** Every badge tier reached, with when it was reached. */
export function evaluateAchievements(
  input: EngagementInput,
  facts: AchievementFacts,
  timeZone: string
): Unlock[] {
  return badgeProgress(input, facts, timeZone).flatMap((b) => b.unlocks);
}
