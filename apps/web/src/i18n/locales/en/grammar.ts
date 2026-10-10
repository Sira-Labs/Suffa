import type { Messages } from '../../types';
import type { grammar as de } from '../de/grammar';

export const grammar: Messages<typeof de> = {
  none: 'There is no grammar for this section yet.',
  quickCheck: 'Quick check',
  allDone: '✓ All questions correct',
  backToUnit: 'Back to the unit',
  examples: 'Examples',
  listen: '{{example}} – listen',
  answers: 'Answers',
  correct: '✓ Correct',
  wrong: 'Not quite – have another look at the rule above.',
  skip: 'Skip',
};
