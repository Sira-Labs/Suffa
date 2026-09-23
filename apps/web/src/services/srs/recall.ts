/**
 * Single entry point for grading a typed recall answer: Arabic answers are compared
 * tashkīl-tolerantly (`gradeAnswer`), answers in the learner's language with the
 * meaning-aware matcher (`gradeTranslation`).
 */
import { gradeAnswer, type AnswerVerdict } from './tashkil';
import { gradeTranslation } from './translation';

/** Every verdict a recall answer can get; all but `wrong` count as correct. */
export type RecallVerdict = AnswerVerdict | 'accepted' | 'typo';

export interface RecallGrade {
  verdict: RecallVerdict;
  /** Meanings the learner hit (translations only). */
  matched: string[];
  /** Further correct meanings the learner did not type (translations only). */
  alsoCorrect: string[];
}

export function isCorrect(verdict: RecallVerdict): boolean {
  return verdict !== 'wrong';
}

export function gradeRecall(
  input: string,
  expected: string,
  answerIsArabic: boolean
): RecallGrade {
  if (answerIsArabic) {
    return { verdict: gradeAnswer(input, expected), matched: [], alsoCorrect: [] };
  }
  const grade = gradeTranslation(input, expected);
  return {
    verdict: grade.verdict,
    matched: grade.matched,
    alsoCorrect:
      grade.verdict === 'wrong'
        ? []
        : grade.meanings.filter((m) => !grade.matched.includes(m)),
  };
}
