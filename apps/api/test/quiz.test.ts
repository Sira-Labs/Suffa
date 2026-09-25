import { describe, expect, it } from 'vitest';
import {
  answerPoints,
  buildQuestions,
  leaderboard,
  nextStep,
  shortMeaning,
  type QuizWord,
} from '../src/classes/quiz.js';

const words: QuizWord[] = [
  { id: 'kitab', ar: 'كِتَابٌ', de: 'Buch', unit: 1 },
  { id: 'qalam', ar: 'قَلَمٌ', de: 'Stift, Kuli', unit: 1 },
  { id: 'bab', ar: 'بَابٌ', de: 'Tür', unit: 1 },
  { id: 'bayt', ar: 'بَيْتٌ', de: 'Haus', unit: 1 },
  { id: 'madrasa', ar: 'مَدْرَسَةٌ', de: 'Schule', unit: 2 },
  { id: 'bayt2', ar: 'دَارٌ', de: 'Haus', unit: 2 },
];
/** Deterministic "random": always the first choice. */
const first = () => 0;

describe('live quiz rules (story 14.4)', () => {
  it('puts leech words first, then tops up from the reached units without repeats', () => {
    const questions = buildQuestions(words, ['qalam', 'unknown', 'qalam'], [1], 3, first);
    expect(questions.map((q) => q.wordId)[0]).toBe('qalam');
    expect(new Set(questions.map((q) => q.wordId)).size).toBe(3);
    expect(
      questions.every((q) => ['kitab', 'qalam', 'bab', 'bayt'].includes(q.wordId))
    ).toBe(true);
  });

  it('offers four short meanings with the right one marked and no duplicate answer', () => {
    const [q] = buildQuestions(words, ['bayt'], [], 1, first);
    expect(q!.prompt).toBe('بَيْتٌ');
    expect(q!.options).toHaveLength(4);
    expect(q!.options[q!.correct]).toBe('Haus');
    // "دَارٌ" also means "Haus": it must not appear as a second "Haus".
    expect(q!.options.filter((o) => o === 'Haus')).toHaveLength(1);
    expect(new Set(q!.options).size).toBe(4);
    expect(shortMeaning('Stift, Kuli')).toBe('Stift');
  });

  it('rewards correct and quick answers only', () => {
    expect(answerPoints(false, 0)).toBe(0);
    expect(answerPoints(true, 0)).toBe(1000);
    expect(answerPoints(true, 10_000)).toBe(750);
    expect(answerPoints(true, 30_000)).toBe(500);
  });

  it('names only the top five', () => {
    const board = leaderboard(
      Array.from({ length: 7 }, (_, i) => ({
        userId: `u${i}`,
        name: `L${i}`,
        points: i * 10,
      })),
      'u0'
    );
    expect(board.map((b) => b.name)).toEqual(['L6', 'L5', 'L4', 'L3', 'L2']);
    expect(board.some((b) => b.you)).toBe(false);
  });

  it('moves lobby → question → … → finished', () => {
    expect(nextStep('lobby', -1, 2)).toEqual({ status: 'question', current: 0 });
    expect(nextStep('reveal', 0, 2)).toEqual({ status: 'question', current: 1 });
    expect(nextStep('reveal', 1, 2)).toEqual({ status: 'finished', current: 1 });
    expect(nextStep('question', 0, 2)).toBeNull();
    expect(nextStep('lobby', -1, 0)).toBeNull();
  });
});
