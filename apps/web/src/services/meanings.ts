/**
 * Meaning language (story 16.4, ADR-0021): which language glosses are shown in and which
 * language translation answers are typed and graded in. Content carries German (`de`) and,
 * once reviewed in the CMS and published, English (`en`). A missing English gloss falls
 * back to German, flagged so the screen can show a "not yet translated" badge.
 *
 * Words may also carry Turkish, Italian, Bosnian and Albanian (`bedeutungen`, story 18.4,
 * ADR-0032). The lookup knows them; learners cannot choose them as their meaning language
 * until translation answers are graded in them too.
 */
import i18n from '@/i18n';
import { useSettingsStore } from '@/state/settingsStore';
import type { WeitereBedeutungen } from '@/types';

export type MeaningLanguage = 'de' | 'en';

export const MEANING_LANGUAGES: readonly MeaningLanguage[] = ['de', 'en'];

/** The languages only words have a gloss in so far, and no learner can choose yet. */
export type FurtherMeaningLanguage = keyof WeitereBedeutungen;
/** Every language a gloss can be in. */
export type GlossLanguage = MeaningLanguage | FurtherMeaningLanguage;

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
  return value === 'de' || value === 'en';
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
