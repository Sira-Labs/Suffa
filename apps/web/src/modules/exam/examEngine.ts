/**
 * Exam generator: produces interleaved questions across many formats.
 *
 * Learning principles: interleaving (mixed formats), mixed chapter exam
 * (several units in one exam, mirroring the real class exam),
 * speed round (time pressure) and adaptive mode (difficult items more often).
 */
import type { ExamFormat } from '@/types';
import { content } from '@/content';

export interface ExamQuestion {
  id: string;
  format: ExamFormat;
  contentRef: string;
  prompt: string;
  promptIsArabic: boolean;
  /** Expected (free-text) answer. */
  expected: string;
  expectedIsArabic: boolean;
  /** For choice formats: options (including the correct answer). */
  options?: string[];
  hint?: string;
}

export interface ExamConfig {
  formats: ExamFormat[];
  units: number[];
  count: number;
  /** Speed round: seconds per question (0 = unlimited). */
  secondsPerQuestion?: number;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function distractors(correct: string, pool: string[], n = 3): string[] {
  const picks = shuffle(pool.filter((x) => x !== correct)).slice(0, n);
  return shuffle([correct, ...picks]);
}

let counter = 0;
function qid(): string {
  counter += 1;
  return `q${counter}-${Math.random().toString(36).slice(2, 7)}`;
}

type Generator = () => ExamQuestion | null;

export function generateExam(config: ExamConfig): ExamQuestion[] {
  const unitSet = new Set(config.units);
  const vocab = content.vokabeln.filter(
    (v) => config.units.length === 0 || unitSet.has(v.einheit)
  );
  const allDe = content.vokabeln.map((v) => v.de);
  const allPlurals = content.vokabeln
    .map((v) => v.plural)
    .filter((p): p is string => !!p);

  const generators: Record<ExamFormat, Generator> = {
    vocab_ar_de: () => {
      const v = vocab[Math.floor(Math.random() * vocab.length)];
      if (!v) return null;
      return {
        id: qid(),
        format: 'vocab_ar_de',
        contentRef: v.id,
        prompt: v.ar,
        promptIsArabic: true,
        expected: v.de,
        expectedIsArabic: false,
        options: distractors(v.de, allDe),
        hint: `Wurzel ${v.wurzel}`,
      };
    },
    vocab_de_ar: () => {
      const v = vocab[Math.floor(Math.random() * vocab.length)];
      if (!v) return null;
      return {
        id: qid(),
        format: 'vocab_de_ar',
        contentRef: v.id,
        prompt: v.de,
        promptIsArabic: false,
        expected: v.ar,
        expectedIsArabic: true,
      };
    },
    plural: () => {
      const withPlural = vocab.filter((v) => v.plural);
      const v = withPlural[Math.floor(Math.random() * withPlural.length)];
      if (!v || !v.plural) return null;
      return {
        id: qid(),
        format: 'plural',
        contentRef: v.id,
        prompt: `Plural von „${v.ar}“ (${v.de})`,
        promptIsArabic: false,
        expected: v.plural,
        expectedIsArabic: true,
        options: distractors(v.plural, allPlurals),
      };
    },
    root: () => {
      const v = vocab[Math.floor(Math.random() * vocab.length)];
      if (!v) return null;
      const roots = [...new Set(content.vokabeln.map((x) => x.wurzel))];
      return {
        id: qid(),
        format: 'root',
        contentRef: v.id,
        prompt: `Wurzel von „${v.ar}“ (${v.de})?`,
        promptIsArabic: false,
        expected: v.wurzel,
        expectedIsArabic: true,
        options: distractors(v.wurzel, roots),
      };
    },
    conjugation: () => {
      const verb = content.verben[Math.floor(Math.random() * content.verben.length)];
      if (!verb) return null;
      return {
        id: qid(),
        format: 'conjugation',
        contentRef: verb.id,
        prompt: `${verb.lemma} → أنا, الماضي`,
        promptIsArabic: false,
        expected: verb.madi.ana,
        expectedIsArabic: true,
        hint: verb.de,
      };
    },
    listening: () => {
      const v = vocab[Math.floor(Math.random() * vocab.length)];
      if (!v) return null;
      return {
        id: qid(),
        format: 'listening',
        contentRef: v.id,
        prompt: v.ar,
        promptIsArabic: true,
        expected: v.de,
        expectedIsArabic: false,
        options: distractors(v.de, allDe),
        hint: 'Anhören und Bedeutung wählen',
      };
    },
    reading: () => {
      const lines = content.dialoge.flatMap((d) => d.zeilen);
      const z = lines[Math.floor(Math.random() * lines.length)];
      if (!z) return null;
      return {
        id: qid(),
        format: 'reading',
        contentRef: z.ar,
        prompt: z.ar,
        promptIsArabic: true,
        expected: z.de,
        expectedIsArabic: false,
        options: distractors(
          z.de,
          lines.map((l) => l.de)
        ),
      };
    },
    writing: () => {
      const v = vocab[Math.floor(Math.random() * vocab.length)];
      if (!v) return null;
      return {
        id: qid(),
        format: 'writing',
        contentRef: v.id,
        prompt: `Schreibe „${v.tr}“ (${v.de}) auf Arabisch`,
        promptIsArabic: false,
        expected: v.ar,
        expectedIsArabic: true,
      };
    },
    speaking: () => {
      const v = vocab[Math.floor(Math.random() * vocab.length)];
      if (!v) return null;
      return {
        id: qid(),
        format: 'speaking',
        contentRef: v.id,
        prompt: v.ar,
        promptIsArabic: true,
        expected: v.ar,
        expectedIsArabic: true,
        hint: 'Laut aussprechen (Selbstkontrolle)',
      };
    },
    minimalpair: () => {
      const mp =
        content.phonologie_minimalpaare[
          Math.floor(Math.random() * content.phonologie_minimalpaare.length)
        ];
      if (!mp) return null;
      return {
        id: qid(),
        format: 'minimalpair',
        contentRef: mp.id,
        prompt: `Welches Wort bedeutet „${mp.de.split(' / ')[0]}“?`,
        promptIsArabic: false,
        expected: mp.a,
        expectedIsArabic: true,
        options: shuffle([mp.a, mp.b]),
        hint: `Kontrast ${mp.kontrast}`,
      };
    },
    mixed_chapter: () => null, // realised via the other formats
    speed: () => null,
    adaptive: () => null,
    stage_test: () => null, // a stage test mixes the other formats
  };

  // "mixed_chapter", "speed" and "adaptive" draw on the full format set.
  const baseFormats = config.formats.filter(
    (f) =>
      f !== 'mixed_chapter' && f !== 'speed' && f !== 'adaptive' && f !== 'stage_test'
  );
  const effectiveFormats =
    baseFormats.length > 0
      ? baseFormats
      : (['vocab_ar_de', 'vocab_de_ar', 'plural', 'root', 'conjugation'] as ExamFormat[]);

  const questions: ExamQuestion[] = [];
  let guard = 0;
  while (questions.length < config.count && guard < config.count * 10) {
    guard++;
    // Interleaving: rotate to a different format for each question.
    const format = effectiveFormats[questions.length % effectiveFormats.length]!;
    const q = generators[format]();
    if (q) questions.push(q);
  }
  return questions;
}
