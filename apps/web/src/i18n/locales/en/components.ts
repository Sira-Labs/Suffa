import type { Messages } from '../../types';
import type { components as de } from '../de/components';

export const components: Messages<typeof de> = {
  sync: {
    idle: 'In sync',
    syncing: 'Syncing…',
    offline: 'Offline',
    error: 'Sync error',
    disabled: 'Local only',
    signIn: 'Sign in',
    hint: 'Syncs automatically – tap to sync now',
    pending: '· {{count}} pending',
    signedIn: '· signed in',
  },
  rating: {
    question: 'How well did you know it?',
    again: 'Again',
    hard: 'Hard',
    good: 'Good',
    easy: 'Easy',
    now: 'now',
    days_one: '{{count}} day',
    days_other: '{{count}} days',
    months_one: '~{{count}} month',
    months_other: '~{{count}} months',
  },
  meaning: {
    notTranslated: 'not yet translated',
    notTranslatedHint:
      'This meaning has no reviewed English version yet; the German one stands in for it.',
  },
  feedback: {
    correct: '✓ Correct',
    typo: '✓ Correct – small typo',
    tashkilTolerant: '✓ Correct – tashkīl incomplete, but accepted',
    wrong: '✗ Not quite yet',
    expected: 'Expected: ',
    right: 'Correct: ',
    alsoCorrect: 'Also correct: ',
  },
  tashkil: {
    group: 'Tashkīl level',
    label: 'Tashkīl:',
    full: 'Full',
    partial: 'Partial',
    none: 'None',
  },
  keyboard: {
    title: 'Arabic keyboard',
    letter: 'Letter {{char}}',
    hamza: 'Hamza variant {{char}}',
    space: 'Space',
    delete: 'Delete',
    harakatOn: 'Harakāt on',
    harakatOff: 'Harakāt off',
  },
  celebration: { xp: '+{{count}} XP' },
  recall: { answer: 'Type your answer' },
  collapsible: { collapse: 'Collapse ▴', expand: 'Expand ▾' },
  queue: { open: '{{count}} left' },
  example: {
    label: 'Example sentence',
    own: 'Own example sentence (Suffa)',
    source: 'Example:',
    by: ' by {{author}}',
    translatedBySuffa: ' · Translation: Suffa',
  },
  routeError: {
    notFound: 'Page not found',
    failed: 'Something went wrong',
    notFoundText: 'This page does not exist.',
    failedText:
      'The error has been reported. Your progress is stored on this device and stays.',
    home: 'To the overview',
    reload: 'Reload',
  },
};
