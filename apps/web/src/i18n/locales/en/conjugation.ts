import type { Messages } from '../../types';
import type { conjugation as de } from '../de/conjugation';

export const conjugation: Messages<typeof de> = {
  title: 'Conjugation trainer',
  noVerbs: 'This unit does not introduce any verbs yet.',
  root: 'Root',
  tenses: {
    madi: 'الماضي (past)',
    mudari: 'المضارع (present)',
    amr: 'الأمر (imperative)',
  },
  table: 'Table',
  drill: 'Gap drill',
  conjugate: 'Conjugate',
  check: 'Check',
  nextForm: 'Next form',
};
