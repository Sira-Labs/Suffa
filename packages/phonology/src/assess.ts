/**
 * Letter feedback from a speech recogniser's transcript (ADR-0022, the ASR assessor).
 *
 * The recogniser writes what it heard in plain Arabic spelling, without vowels. The expected
 * text and the transcript are aligned letter by letter, both normalised for spellings a
 * recogniser varies freely (hamza seats, tāʾ marbūṭa, alif maqṣūra). Each letter that is
 * spoken (per `g2p`) is then rated:
 * - good: heard as written;
 * - wrong: heard as a sound learners typically confuse it with (س for ص, ه for ح, …);
 * - check: missing, or heard as something else — possibly the recogniser, so no verdict.
 * Feedback, not a verdict: three classes, and one tip per sound that needs work.
 */
import { g2p } from './g2p.js';

export type LetterStatus = 'good' | 'check' | 'wrong';

export interface LetterResult {
  /** Index of the letter in the expected text. */
  index: number;
  letter: string;
  /** Word (index into the expected text's words) the letter belongs to. */
  word: number;
  status: LetterStatus;
  /** The letter heard in its place, if any. */
  heard: string | null;
}

export interface Assessment {
  /** 0–1: good letters count fully, "check" half. */
  score: number;
  /** Every spoken letter of the expected text, in order. */
  letters: LetterResult[];
  /** At most three tips (German), for the sounds that need work, most frequent first. */
  tips: string[];
  transcript: string;
}

/** Spellings a recogniser uses interchangeably count as the same letter. */
const SAME: Readonly<Record<string, string>> = {
  أ: 'ا',
  إ: 'ا',
  آ: 'ا',
  ٱ: 'ا',
  ء: 'ا',
  ؤ: 'و',
  ئ: 'ي',
  ى: 'ي',
  ة: 'ه',
};

/** Sounds learners of German and English typically replace by another (expected → heard). */
const CONFUSIONS: Readonly<Record<string, string>> = {
  ص: 'س',
  ض: 'دذ',
  ط: 'ت',
  ظ: 'زذ',
  ع: 'ا',
  ح: 'ه',
  خ: 'هك',
  غ: 'رخ',
  ق: 'كا',
  ث: 'ست',
  ذ: 'زد',
};

const TIPS: Readonly<Record<string, string>> = {
  ع: 'ع (ʿain): tief in der Kehle gepresst, wie ein gedrücktes „a“ – nicht weglassen.',
  ح: 'ح (ḥa): kräftig gehauchtes h aus der engen Kehle, wie beim Anhauchen einer Brille.',
  خ: 'خ (cha): wie „ch“ in „Bach“.',
  غ: 'غ (ghain): wie ein gegurgeltes Zäpfchen-r.',
  ق: 'ق (qaf): ein k ganz hinten am Gaumen, tiefer als ك.',
  ص: 'ص (ṣad): ein „dunkles“ s – den Zungenrücken anheben, als würdest du „o“ denken.',
  ض: 'ض (ḍad): ein „dunkles“ d mit angehobenem Zungenrücken.',
  ط: 'ط (ṭa): ein „dunkles“ t mit angehobenem Zungenrücken.',
  ظ: 'ظ (ẓa): ein „dunkles“ englisches „th“ wie in „this“.',
  ث: 'ث (tha): wie englisches „th“ in „think“, die Zunge zwischen den Zähnen.',
  ذ: 'ذ (dhal): wie englisches „th“ in „this“, die Zunge zwischen den Zähnen.',
  ه: 'ه (ha): ein leichtes h, auch am Wortende hörbar.',
  ر: 'ر (ra): ein gerolltes Zungen-r.',
  ء: 'Hamza: ein kurzer Stimmabsatz wie in „be-achten“.',
};
const LONG_VOWEL_TIP = 'Lange Vokale (ā, ī, ū) deutlich doppelt so lang halten.';
const SHADDA_TIP = 'Schadda: den doppelten Konsonanten hörbar länger halten.';
const MAX_TIPS = 3;

const HAMZA_SEATS = new Set(['ء', 'أ', 'إ', 'ؤ', 'ئ', 'آ']);

function isLetter(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (code >= 0x621 && code <= 0x64a) || ch === 'ٱ';
}

const key = (ch: string) => SAME[ch] ?? ch;

/** Positions of the letters (not marks) in a text. */
function letterPositions(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) if (isLetter(text[i]!)) out.push(i);
  return out;
}

type Step = { expected: number; heard: number | null };

/** Levenshtein alignment of two letter sequences; returns, per expected letter, its match. */
function align(expected: string[], heard: string[]): Step[] {
  const m = expected.length;
  const n = heard.length;
  const d = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = key(expected[i - 1]!) === key(heard[j - 1]!) ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
    }
  }
  const steps: Step[] = [];
  let i = m;
  let j = n;
  while (i > 0) {
    const cost = j > 0 && key(expected[i - 1]!) === key(heard[j - 1]!) ? 0 : 1;
    if (j > 0 && d[i]![j] === d[i - 1]![j - 1]! + cost) {
      steps.push({ expected: i - 1, heard: j - 1 });
      i--;
      j--;
    } else if (j > 0 && d[i]![j] === d[i]![j - 1]! + 1) {
      j--;
    } else {
      steps.push({ expected: i - 1, heard: null });
      i--;
    }
  }
  return steps.reverse();
}

/**
 * Rates each spoken letter of `expected` (vocalised Arabic) against a recogniser's
 * `transcript`.
 */
export function assessLetters(expected: string, transcript: string): Assessment {
  const { phones } = g2p(expected, { pause: false });
  // Spoken letters, and what kind of sound each stands for.
  const spoken = new Map<number, { word: number; long: boolean; geminate: boolean }>();
  for (const phone of phones) {
    const entry = spoken.get(phone.letter) ?? {
      word: phone.word,
      long: false,
      geminate: false,
    };
    if (phone.kind === 'vowel' && phone.ipa.endsWith('ː')) entry.long = true;
    if (phone.kind === 'consonant' && phone.ipa.endsWith('ː')) entry.geminate = true;
    spoken.set(phone.letter, entry);
  }

  const positions = letterPositions(expected);
  const heardLetters = [...transcript].filter(isLetter);
  const steps = align(
    positions.map((p) => expected[p]!),
    heardLetters
  );

  const letters: LetterResult[] = [];
  const tipCounts = new Map<string, number>();
  for (const step of steps) {
    const index = positions[step.expected]!;
    const sound = spoken.get(index);
    if (!sound) continue; // written but silent (waṣl alif, assimilated lam, …)
    const letter = expected[index]!;
    const heard = step.heard === null ? null : heardLetters[step.heard]!;
    let status: LetterStatus;
    if (heard !== null && key(heard) === key(letter)) status = 'good';
    else if (heard !== null && (CONFUSIONS[letter] ?? '').includes(key(heard))) {
      status = 'wrong';
    } else status = 'check';
    letters.push({ index, letter, word: sound.word, status, heard });

    if (status !== 'good') {
      const tip =
        TIPS[HAMZA_SEATS.has(letter) ? 'ء' : letter] ??
        (sound.long ? LONG_VOWEL_TIP : sound.geminate ? SHADDA_TIP : undefined);
      if (tip)
        tipCounts.set(tip, (tipCounts.get(tip) ?? 0) + (status === 'wrong' ? 2 : 1));
    }
  }

  const good = letters.filter((l) => l.status === 'good').length;
  const check = letters.filter((l) => l.status === 'check').length;
  const score = letters.length === 0 ? 0 : (good + check / 2) / letters.length;
  const tips = [...tipCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TIPS)
    .map(([tip]) => tip);
  return { score, letters, tips, transcript };
}
