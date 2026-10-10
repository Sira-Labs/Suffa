import type { Messages } from '../../types';
import type { writing as de } from '../de/writing';

export const writing: Messages<typeof de> = {
  title: 'Writing',
  steps: 'Writing exercises',
  noWords: 'There are no words to write for this unit yet.',
  exercises: {
    abschreiben: 'Copying',
    diktat: 'Dictation',
    umschrift: 'Transliteration → script',
    satzbau: 'Sentence building',
    uebersetzung: 'Translating',
  },
  done: '✓ {{exercise}} done',
  next: 'Next: {{exercise}}',
  backToUnit: 'Back to the unit',
  check: 'Check',
  skip: 'Skip',
  reset: 'Reset',
  prompts: {
    abschreiben: 'Copy the word. Vowel marks are optional.',
    diktat: 'Listen to the word and write it.',
    umschrift: 'Write the word in Arabic script.',
  },
  readAloud: 'Read aloud',
  noTts: 'No speech output – word:',
  writeHere: 'Write here…',
  order: 'Put the words in the right order: “{{sentence}}” · {{position}}',
  orderCorrect: '✓ Put together correctly!',
  orderWrong: '✗ Not yet – tap words to put them back.',
  translate: 'Translate into Arabic · {{position}}',
  translateHint: 'The wording from the dialogue counts – compare and try again.',
};
