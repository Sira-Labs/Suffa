/**
 * Meaning language (story 16.4, ADR-0021): which language glosses are shown in and which
 * language translation answers are typed and graded in. Content carries German (`de`) and,
 * once reviewed in the CMS and published, English (`en`). A missing English gloss falls
 * back to German, flagged so the screen can show a "not yet translated" badge.
 *
 * Words may also carry Turkish, Italian, Bosnian and Albanian (`bedeutungen`, story 18.4,
 * ADR-0032). A learner can choose one of them once the content on the device has meanings
 * in it (ADR-0033); dialogue lines and examples stay German there, flagged like any fallback.
 */
import i18n from '@/i18n';
import { useSettingsStore } from '@/state/settingsStore';
import type { WeitereBedeutungen } from '@/types';

/** The languages only words have a gloss in so far. */
export type FurtherMeaningLanguage = keyof WeitereBedeutungen;
export type MeaningLanguage = 'de' | 'en' | FurtherMeaningLanguage;
/** Every language a gloss can be in. */
export type GlossLanguage = MeaningLanguage;

export const FURTHER_MEANING_LANGUAGES: readonly FurtherMeaningLanguage[] = [
  'tr',
  'it',
  'bs',
  'sq',
];
export const MEANING_LANGUAGES: readonly MeaningLanguage[] = [
  'de',
  'en',
  ...FURTHER_MEANING_LANGUAGES,
];

/** Each language in its own words, as the settings offer it. */
export const MEANING_LANGUAGE_NAMES: Record<MeaningLanguage, string> = {
  de: 'Deutsch',
  en: 'English',
  tr: 'Türkçe',
  it: 'Italiano',
  bs: 'Bosanski',
  sq: 'Shqip',
};

/** Anything with a German gloss and maybe others (words, dialogue lines, examples). */
export interface Glossed {
  de: string;
  en?: string | null;
  bedeutungen?: WeitereBedeutungen | null;
}

export interface Meaning<L extends GlossLanguage = MeaningLanguage> {
  text: string;
  /** The language `text` is in (German when the chosen language has no gloss). */
  lang: L | 'de';
  /** The chosen language had no gloss: `text` is the German fallback. */
  missing: boolean;
}

export function isMeaningLanguage(value: unknown): value is MeaningLanguage {
  return (MEANING_LANGUAGES as readonly unknown[]).includes(value);
}

/**
 * The languages a learner is offered: German and English always, a further one once at least
 * one word on this device has a reviewed meaning in it. The language chosen already stays in
 * the list, so a device that has not downloaded the content yet does not lose the choice.
 */
export function offeredMeaningLanguages(
  words: readonly Glossed[],
  chosen: MeaningLanguage | null = null
): MeaningLanguage[] {
  const withContent = new Set<string>();
  for (const word of words) {
    for (const [language, text] of Object.entries(word.bedeutungen ?? {})) {
      // A stored bundle is not checked word by word: anything but text counts as none.
      if (typeof text === 'string' && text.trim()) withContent.add(language);
    }
  }
  return [
    'de',
    'en',
    ...FURTHER_MEANING_LANGUAGES.filter(
      (language) => withContent.has(language) || language === chosen
    ),
  ];
}

/** The gloss of `item` in `language`, German when that one is missing. */
export function meaningOf<L extends GlossLanguage>(
  item: Glossed,
  language: L
): Meaning<L> {
  const chosen: GlossLanguage = language;
  if (chosen === 'de') return { text: item.de, lang: 'de', missing: false };
  const gloss = (chosen === 'en' ? item.en : item.bedeutungen?.[chosen])?.trim();
  if (gloss) return { text: gloss, lang: language, missing: false };
  return { text: item.de, lang: 'de', missing: true };
}

/**
 * The learner's meaning language: their own choice, else the interface language
 * (ADR-0021: "default: UI language").
 */
export function resolveMeaningLanguage(
  choice: unknown,
  uiLanguage: string | undefined
): MeaningLanguage {
  if (isMeaningLanguage(choice)) return choice;
  return uiLanguage === 'en' ? 'en' : 'de';
}

/** The meaning language right now, outside React (card resolution, exams). */
export function currentMeaningLanguage(): MeaningLanguage {
  return resolveMeaningLanguage(
    useSettingsStore.getState().settings.meaningLanguage,
    i18n.language
  );
}

/** The meaning language, re-rendering when the setting or the interface language changes. */
export function useMeaningLanguage(): MeaningLanguage {
  const choice = useSettingsStore((s) => s.settings.meaningLanguage);
  const uiLanguage = useSettingsStore((s) => s.settings.uiLanguage);
  return resolveMeaningLanguage(choice, uiLanguage ?? i18n.language);
}

/**
 * Glosses for one multiple-choice question in a single language: the chosen one when every
 * item has it, else German for all, so a German option never stands out among English ones.
 */
export function consistentMeanings<L extends GlossLanguage>(
  items: readonly Glossed[],
  language: L
): { texts: string[]; lang: L | 'de'; missing: boolean } {
  const all = items.map((item) => meaningOf(item, language));
  if (all.every((m) => !m.missing)) {
    return { texts: all.map((m) => m.text), lang: language, missing: false };
  }
  return {
    texts: items.map((item) => item.de),
    lang: 'de',
    missing: language !== 'de',
  };
}
