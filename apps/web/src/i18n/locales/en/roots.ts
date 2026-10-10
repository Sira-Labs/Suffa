import type { Messages } from '../../types';
import type { roots as de } from '../de/roots';

export const roots: Messages<typeof de> = {
  explorer: {
    eyebrow: 'Root family',
    title: 'Roots & patterns (الجذر والوزن)',
    intro:
      'Three letters give rise to many words. The root carries the meaning; the pattern tells you what kind of word it is.',
    search: 'Search for a root or meaning',
    searchPlaceholder: 'e.g. كتب or schreiben',
    roots: 'Roots',
    noRoot: 'No root found.',
    legend: 'Solid: already learned · dashed: not learned yet',
    moreWords: 'More words of the family',
    toTrainer: 'Pattern trainer: build words yourself',
  },
  wheel: {
    root: 'Root {{letters}}',
    word: '{{arabic}}: {{meaning}}',
    wordUnlearned: '{{arabic}}: {{meaning}} (not learned yet)',
  },
  word: {
    selected: 'Selected word',
    listenTo: 'Listen to {{word}}',
    listen: 'Listen',
    extra: 'Not in the book – another word from this root.',
    learned: 'Learned in unit {{unit}}.',
    upcoming: 'Comes in unit {{unit}}.',
    pattern: 'Pattern',
    sameWay: 'Likewise:',
    noPattern: 'No pattern has been explained for this word yet.',
  },
  drill: {
    title: 'Exercise: same root?',
    same: 'Same root',
    different: 'Different root',
    correct: '✓ Correct!',
    wrong: '✗ Wrong. {{a}} ({{rootA}}) vs. {{b}} ({{rootB}})',
    nextPair: 'Next pair',
  },
  trainer: {
    back: '← Roots & patterns',
    title: 'Pattern trainer',
    intro: 'Pour the root into the pattern: which word do you get?',
    tooFew:
      'Not enough words with a pattern yet. Work through a few more units, then you can start here.',
    task: 'Task',
    sum: 'Root and pattern',
    root: 'Root',
    pattern: 'Pattern',
    answers: 'Answers',
    correct: '✓ Correct!',
    wrong: '✗ Not quite.',
    nextWord: 'Next word',
    score: '{{right}} of {{total}} correct',
  },
};
