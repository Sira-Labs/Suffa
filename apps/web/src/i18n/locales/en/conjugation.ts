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
  persons: {
    ana: 'I',
    nahnu: 'we',
    anta: 'you (m.)',
    anti: 'you (f.)',
    antuma: 'you two',
    antum: 'you (m. pl.)',
    antunna: 'you (f. pl.)',
    huwa: 'he',
    hiya: 'she',
    huma_m: 'they two (m.)',
    huma_f: 'they two (f.)',
    hum: 'they (m.)',
    hunna: 'they (f.)',
  },
  imperative: {
    m_sg: 'you (m.)',
    f_sg: 'you (f.)',
    dual: 'you two',
    m_pl: 'you (m. pl.)',
    f_pl: 'you (f. pl.)',
  },
};
