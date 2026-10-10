import type { Messages } from '../../types';
import type { cloze as de } from '../de/cloze';

export const cloze: Messages<typeof de> = {
  loadFailed: 'The example sentences could not be loaded.',
  loading: 'Loading sentences …',
  none: 'There are no gap texts for these words yet.',
  allDone: '✓ All gaps filled',
  backToUnit: 'Back to the unit',
  prompt: 'Which word is missing? · {{position}}',
  gap: 'Gap',
  quote: '“{{text}}”',
  choices: 'Choices',
  correct: '✓ Correct – {{arabic}} · {{meaning}}',
  wrong: 'Not quite – try another word.',
  skip: 'Skip',
};
