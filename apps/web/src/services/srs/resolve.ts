/**
 * Resolves an SRS card to its static (or user-created) content.
 * Returns a uniform prompt/answer pair per CardKind, the basis for all
 * recall modules and exam formats. Prompts and hints come in the interface language at call
 * time (story 16.3); the German meanings inside them are course content and stay German.
 */
import i18n from '@/i18n';
import type {
  CardKind,
  Minimalpaar,
  NisbaEintrag,
  UserVocab,
  Verb,
  Vokabel,
} from '@/types';
import { content, madinahVokabeln, retiredVokabeln } from '@/content';

export interface ResolvedCard {
  contentRef: string;
  kind: CardKind;
  /** What the learner is shown. */
  prompt: string;
  promptIsArabic: boolean;
  /** What should be produced/recalled. */
  answer: string;
  answerIsArabic: boolean;
  /** Additional learning aid (root, wazn, hint, explanation). */
  hint?: string;
  transliteration?: string;
  /** Full Arabic text to read aloud (TTS), if available. */
  speakable?: string;
}

function vokabelLookup(userVocab: UserVocab[]): Map<string, Vokabel | UserVocab> {
  const map = new Map<string, Vokabel | UserVocab>();
  // Removed words first: a card made before the removal still resolves (story 16.2).
  for (const v of retiredVokabeln) map.set(v.id, v);
  for (const v of content.vokabeln) map.set(v.id, v);
  for (const v of madinahVokabeln) map.set(v.id, v);
  for (const v of userVocab) map.set(v.id, v);
  return map;
}

const nisbaById = new Map<string, NisbaEintrag>(content.nisba.map((n) => [n.id, n]));
const verbById = new Map<string, Verb>(content.verben.map((v) => [v.id, v]));
const mpById = new Map<string, Minimalpaar>(
  content.phonologie_minimalpaare.map((m) => [m.id, m])
);

export function resolveCard(
  kind: CardKind,
  contentRef: string,
  userVocab: UserVocab[] = []
): ResolvedCard | null {
  const vocab = vokabelLookup(userVocab);

  switch (kind) {
    case 'vocab_ar_de': {
      const v = vocab.get(contentRef);
      if (!v) return null;
      return {
        contentRef,
        kind,
        prompt: v.ar,
        promptIsArabic: true,
        answer: v.de,
        answerIsArabic: false,
        transliteration: v.tr || undefined,
        hint: v.wurzel
          ? v.wazn
            ? i18n.t('vocab:cards.rootWazn', { root: v.wurzel, wazn: v.wazn })
            : i18n.t('vocab:cards.root', { root: v.wurzel })
          : undefined,
        speakable: v.ar,
      };
    }
    case 'vocab_de_ar': {
      const v = vocab.get(contentRef);
      if (!v) return null;
      return {
        contentRef,
        kind,
        prompt: v.de,
        promptIsArabic: false,
        answer: v.ar,
        answerIsArabic: true,
        transliteration: v.tr || undefined,
        hint: v.wurzel ? i18n.t('vocab:cards.root', { root: v.wurzel }) : undefined,
        speakable: v.ar,
      };
    }
    case 'plural': {
      const v = vocab.get(contentRef);
      if (!v || !v.plural) return null;
      return {
        contentRef,
        kind,
        prompt: i18n.t('vocab:cards.pluralOf', { ar: v.ar, de: v.de }),
        promptIsArabic: false,
        answer: v.plural,
        answerIsArabic: true,
        hint: v.wurzel
          ? i18n.t('vocab:cards.singularRoot', { ar: v.ar, root: v.wurzel })
          : i18n.t('vocab:cards.singular', { ar: v.ar }),
        speakable: v.plural,
      };
    }
    case 'root_to_word': {
      const v = vocab.get(contentRef);
      if (!v || !v.wurzel) return null;
      return {
        contentRef,
        kind,
        prompt: i18n.t('vocab:cards.rootToWord', { root: v.wurzel, de: v.de }),
        promptIsArabic: false,
        answer: v.ar,
        answerIsArabic: true,
        hint: v.wazn ? i18n.t('vocab:cards.wazn', { wazn: v.wazn }) : undefined,
        speakable: v.ar,
      };
    }
    case 'nisba': {
      const n = nisbaById.get(contentRef);
      if (!n) return null;
      return {
        contentRef,
        kind,
        prompt: i18n.t('vocab:cards.nisba', { land: n.land, de: n.de }),
        promptIsArabic: false,
        answer: n.m,
        answerIsArabic: true,
        hint: i18n.t('vocab:cards.nisbaHint', { f: n.f, pl: n.pl }),
        speakable: n.m,
      };
    }
    case 'conjugation': {
      const verb = verbById.get(contentRef);
      if (!verb) return null;
      return {
        contentRef,
        kind,
        prompt: i18n.t('vocab:cards.conjugate', { lemma: verb.lemma, de: verb.de }),
        promptIsArabic: false,
        answer: verb.madi.huwa,
        answerIsArabic: true,
        hint: i18n.t('vocab:cards.rootWazn', { root: verb.wurzel, wazn: verb.wazn }),
        speakable: verb.madi.huwa,
      };
    }
    case 'minimalpair': {
      const mp = mpById.get(contentRef);
      if (!mp) return null;
      return {
        contentRef,
        kind,
        prompt: i18n.t('vocab:cards.minimalPair', { contrast: mp.kontrast, de: mp.de }),
        promptIsArabic: false,
        answer: `${mp.a} / ${mp.b}`,
        answerIsArabic: true,
        hint: mp.kontrast,
        speakable: mp.a,
      };
    }
    default:
      return null;
  }
}
