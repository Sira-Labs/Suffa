/**
 * Live class quiz (story 14.4, engagement plan §6 "Friday class quiz"): rules without I/O.
 * Questions come from the class's leech words (the words most learners struggle with),
 * topped up from the units the class is working on. Each shows the Arabic word with four
 * German meanings; points reward correct and quick answers. Only the top five are shown.
 */
export const QUESTION_SECONDS = 20;
export const DEFAULT_QUESTIONS = 8;
export const MAX_QUESTIONS = 15;
export const OPTIONS = 4;
export const LEADERBOARD_SIZE = 5;
const BASE_POINTS = 500;
const SPEED_POINTS = 500;

export interface QuizWord {
  id: string;
  ar: string;
  de: string;
  unit: number;
}

export interface QuizQuestion {
  wordId: string;
  prompt: string;
  options: string[];
  correct: number;
}

export type QuizStatus = 'lobby' | 'question' | 'reveal' | 'finished';

/** A random integer in [0, n) — injectable for tests. */
export type Random = (n: number) => number;

function shuffle<T>(items: readonly T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** The first meaning ("Buch, Heft" → "Buch"), so options stay short on a phone. */
export function shortMeaning(de: string): string {
  return de.split(/[,;/]/)[0]!.trim();
}

/**
 * Questions for a quiz: leech words first (in the order given, most learners first), then
 * random words from `fillUnits`, without repeats. Distractors come from the same unit where
 * possible, never with the same meaning as the answer.
 */
export function buildQuestions(
  words: readonly QuizWord[],
  leechIds: readonly string[],
  fillUnits: readonly number[],
  count: number,
  random: Random
): QuizQuestion[] {
  const byId = new Map(words.map((w) => [w.id, w]));
  const chosen: QuizWord[] = [];
  const seen = new Set<string>();
  const take = (w: QuizWord | undefined) => {
    if (w && !seen.has(w.id) && chosen.length < count) {
      seen.add(w.id);
      chosen.push(w);
    }
  };
  for (const id of leechIds) take(byId.get(id));
  const units = new Set(fillUnits);
  for (const w of shuffle(
    words.filter((w) => units.has(w.unit)),
    random
  ))
    take(w);

  return chosen.map((word) => {
    const answer = shortMeaning(word.de);
    const pick = (pool: readonly QuizWord[]) =>
      shuffle(pool, random)
        .map((w) => shortMeaning(w.de))
        .filter((m, i, all) => m !== answer && all.indexOf(m) === i);
    const sameUnit = pick(words.filter((w) => w.unit === word.unit && w.id !== word.id));
    const others = pick(words.filter((w) => w.id !== word.id));
    const distractors = [...new Set([...sameUnit, ...others])].slice(0, OPTIONS - 1);
    const options = shuffle([answer, ...distractors], random);
    return {
      wordId: word.id,
      prompt: word.ar,
      options,
      correct: options.indexOf(answer),
    };
  });
}

/** Points for an answer: nothing when wrong, 500 plus up to 500 for speed when right. */
export function answerPoints(correct: boolean, elapsedMs: number): number {
  if (!correct) return 0;
  const left = Math.max(0, 1 - elapsedMs / (QUESTION_SECONDS * 1000));
  return BASE_POINTS + Math.round(SPEED_POINTS * left);
}

export interface Standing {
  userId: string;
  name: string | null;
  points: number;
}

/** Top five by points (ties by name); the caller is marked. Nobody below is listed. */
export function leaderboard(
  standings: readonly Standing[],
  callerId: string
): { name: string; points: number; you: boolean }[] {
  return [...standings]
    .sort(
      (a, b) => b.points - a.points || (a.name ?? '').localeCompare(b.name ?? '', 'de')
    )
    .slice(0, LEADERBOARD_SIZE)
    .map((s) => ({
      name: s.name?.trim() || 'Jemand aus der Klasse',
      points: s.points,
      you: s.userId === callerId,
    }));
}

/** The state after the teacher's "weiter": first question, next question, or the end. */
export function nextStep(
  status: QuizStatus,
  current: number,
  questions: number
): { status: QuizStatus; current: number } | null {
  if (status === 'lobby')
    return questions > 0 ? { status: 'question', current: 0 } : null;
  if (status === 'reveal') {
    return current + 1 < questions
      ? { status: 'question', current: current + 1 }
      : { status: 'finished', current };
  }
  return null;
}
