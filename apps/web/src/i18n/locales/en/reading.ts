import type { Messages } from '../../types';
import type { reading as de } from '../de/reading';

export const reading: Messages<typeof de> = {
  title: 'Reading',
  noText: 'There is no reading text for this unit yet.',
  intro:
    'Vowelled texts with tap-a-word glosses. Tap a word to see its meaning and root (comprehensible input, i+1).',
  dialogue: 'U{{unit}}·D{{dialogue}}',
  translationOff: 'Hide translation',
  translationOn: 'Show translation',
  listenLine: 'Listen to the line',
  root: 'root',
  comprehension: 'Reading comprehension',
  question: 'What does the first line (<1>{{line}}</1>) mean?',
  correct: '✓ Correct!',
  wrong: '✗ The right answer: {{answer}}',
};
