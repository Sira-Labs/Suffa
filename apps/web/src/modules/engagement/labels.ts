/**
 * Quest and badge texts in the interface language (story 16.3). The definitions live in
 * @suffa/engagement, German and shared with the server; these lookups show them translated and
 * fall back to the German text for an id the catalogue does not know yet.
 */
import { ALL_STAGES, type BadgeDef, type QuestDef, type Tier } from '@suffa/engagement';
import i18n from '@/i18n';
import { dataText, stageBadge } from '@/modules/units/labels';

export function questTitle(quest: Pick<QuestDef, 'id' | 'title'>): string {
  return dataText(`engagement:quests.${quest.id}`, quest.title);
}

/** Transliterated names stay; a stage badge carries a German name and is translated. */
export function badgeName(badge: Pick<BadgeDef, 'id' | 'name'>): string {
  const stage = ALL_STAGES.find((s) => s.ref === badge.id);
  return stage ? stageBadge(stage) : badge.name;
}

export function badgeMeaning(badge: Pick<BadgeDef, 'id' | 'meaning'>): string {
  return dataText(`engagement:badges.${badge.id}.meaning`, badge.meaning);
}

/** What to do for a tier, with its threshold `n`. */
export function badgeRule(badge: Pick<BadgeDef, 'id' | 'rule'>, n: number): string {
  const fallback = badge.rule.replace('{n}', String(n));
  return dataText(`engagement:badges.${badge.id}.rule`, fallback, { n });
}

export function tierLabel(tier: Tier): string {
  return i18n.t(`engagement:tiers.${tier}`);
}
