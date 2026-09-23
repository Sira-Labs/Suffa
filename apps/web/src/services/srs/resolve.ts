/**
 * Resolves an SRS card to its static (or user-created) content.
 * Returns a uniform prompt/answer pair per CardKind, the basis for all
 * recall modules and exam formats.
 */
import type {
  CardKind,
  Minimalpaar,
  NisbaEintrag,
  UserVocab,
  Verb,
  Vokabel,
} from '@/types';
import { content } from '@/content';

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
  for (const v of content.vokabeln) map.set(v.id, v);
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
        transliteration: v.tr,
        hint: `Wurzel ${v.wurzel}${v.wazn ? ` · Wazn ${v.wazn}` : ''}`,
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
        transliteration: v.tr,
        hint: `Wurzel ${v.wurzel}`,
        speakable: v.ar,
      };
    }
    case 'plural': {
      const v = vocab.get(contentRef);
      if (!v || !v.plural) return null;
      return {
        contentRef,
        kind,
        prompt: `Plural von „${v.ar}“ (${v.de})`,
        promptIsArabic: false,
        answer: v.plural,
        answerIsArabic: true,
        hint: `Singular ${v.ar} · Wurzel ${v.wurzel}`,
        speakable: v.plural,
      };
    }
    case 'root_to_word': {
      const v = vocab.get(contentRef);
      if (!v) return null;
      return {
        contentRef,
        kind,
        prompt: `Wurzel ${v.wurzel} → Wort mit Bedeutung „${v.de}“`,
        promptIsArabic: false,
        answer: v.ar,
        answerIsArabic: true,
        hint: v.wazn ? `Wazn ${v.wazn}` : undefined,
        speakable: v.ar,
      };
    }
    case 'nisba': {
      const n = nisbaById.get(contentRef);
      if (!n) return null;
      return {
        contentRef,
        kind,
        prompt: `Nisba (männlich) zu „${n.land}“ (${n.de})`,
        promptIsArabic: false,
        answer: n.m,
        answerIsArabic: true,
        hint: `weiblich ${n.f} · Plural ${n.pl}`,
        speakable: n.m,
      };
    }
    case 'conjugation': {
      const verb = verbById.get(contentRef);
      if (!verb) return null;
      return {
        contentRef,
        kind,
        prompt: `Konjugiere „${verb.lemma}“ (${verb.de}) – هُوَ, الماضي`,
        promptIsArabic: false,
        answer: verb.madi.huwa,
        answerIsArabic: true,
        hint: `Wurzel ${verb.wurzel} · Wazn ${verb.wazn}`,
        speakable: verb.madi.huwa,
      };
    }
    case 'minimalpair': {
      const mp = mpById.get(contentRef);
      if (!mp) return null;
      return {
        contentRef,
        kind,
        prompt: `Minimalpaar (${mp.kontrast}): ${mp.de}`,
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
