/**
 * Quest and badge texts in the interface language (story 16.3). The definitions live in
 * @suffa/engagement, German and shared with the server; these lookups show them translated and
 * fall back to the German text for an id the catalogue does not know yet.
 */
import {
  ALL_STAGES,
  type BadgeDef,
  type CourseId,
  type QuestDef,
  type Tier,
} from '@suffa/engagement';
import i18n from '@/i18n';
import { dataText, stageBadge } from '@/modules/units/labels';

/** A quest's title; a quest titled for the learner's course uses that course's entry. */
export function questTitle(quest: Pick<QuestDef, 'id' | 'title' | 'titles'>): string {
  const titles = quest.titles ?? {};
  const course = (Object.keys(titles) as CourseId[]).find(
    (c) => titles[c] === quest.title
  );
  const key = course ? `${quest.id}@${course}` : quest.id;
  return dataText(`engagement:quests.${key}`, quest.title);
}

/** Transliterated names stay; a stage badge carries a German name and is translated. */
export function badgeName(badge: Pick<BadgeDef, 'id' | 'name'>): string {
  const stage = ALL_STAGES.find((s) => s.ref === badge.id);
  return stage ? stageBadge(stage) : badge.name;
}

export function badgeMeaning(badge: Pick<BadgeDef, 'id' | 'meaning'>): string {
  return dataText(`engagement:badges.${badge.id}.meaning`, badge.meaning);
}

/** What to do for a tier, with its threshold `n` (singular or plural by `n`). */
export function badgeRule(badge: Pick<BadgeDef, 'id' | 'rule'>, n: number): string {
  const fallback = badge.rule.replace('{n}', String(n));
  return dataText(`engagement:badges.${badge.id}.rule`, fallback, { count: n });
}

export function tierLabel(tier: Tier): string {
  return i18n.t(`engagement:tiers.${tier}`);
}
