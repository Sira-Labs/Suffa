import type { Messages } from '../../types';
import type { review as de } from '../de/review';

export const review: Messages<typeof de> = {
  titles: {
    weak: 'Wobbly words',
    review: 'Review',
    ownWords: 'Unit {{unit}} · Your own words',
    dialogueWords: 'Unit {{unit}} · Dialogue {{section}} · Words',
    unitVocab: 'Unit {{unit}} · Vocabulary',
  },
  endSession: 'End session',
  allReviewed:
    'Everything is reviewed for today. Practising more still counts towards your daily quests.',
  practiseWeak: 'Practise wobbly words ({{count}})',
  moreNew_one: '{{count}} more new word',
  moreNew_other: '{{count}} more new words',
  listenDialogue: 'Listen to a dialogue',
  toToday: 'Back to Today',
};
