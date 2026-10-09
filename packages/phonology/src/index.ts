export { g2p, toIpa, G2pError } from './g2p.js';
export type { G2pOptions, Phone, Transcription, Word } from './g2p.js';
export { SUN_LETTERS } from './letters.js';
export type { ShortVowel } from './letters.js';
export { assessLetters } from './assess.js';
export type { Assessment, LetterResult, LetterStatus } from './assess.js';
export {
  accepted,
  evaluate,
  EvalDataError,
  percentile,
  regressions,
  resolveMarks,
  spearman,
  verdict,
} from './eval.js';
export type {
  AssessorRun,
  EvalBaseline,
  EvalItem,
  EvalMetrics,
  TeacherLabel,
} from './eval.js';
