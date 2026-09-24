import type { IconName } from '@/components/Icon';
import type { PracticeSkill } from '@/types';

/** Stations that open inside a unit, by URL segment (/units/:unit/:station). */
export type UnitStationKey = 'listen' | PracticeSkill;

export const STATION_META: Record<
  UnitStationKey,
  { label: string; icon: IconName; hint: string; sectionHint?: string }
> = {
  listen: {
    label: 'Hören & Sehen',
    icon: 'listen',
    hint: 'Verlagsvideo zur Buchseite und das offizielle Audio',
    sectionHint: 'Das offizielle Audio zu diesem Dialog',
  },
  read: {
    label: 'Lesen',
    icon: 'read',
    hint: 'Dialog lesen, Wörter antippen, Verständnisfrage beantworten',
  },
  cloze: {
    label: 'Lückentext',
    icon: 'read',
    hint: 'Setz das fehlende Wort in echte Sätze ein',
    sectionHint: 'Die Wörter dieses Dialogs in echten Sätzen',
  },
  write: {
    label: 'Schreiben',
    icon: 'write',
    hint: 'Fünf Übungen nacheinander: Abschreiben, Diktat, Umschrift, Satzbau, Übersetzen',
    sectionHint: 'Fünf Übungen zu diesem Dialog – jede richtige Antwort zählt',
  },
  speak: {
    label: 'Sprechen',
    icon: 'speak',
    hint: 'Jeden Satz der Dialoge nachsprechen und aufnehmen',
    sectionHint: 'Jeden Satz des Dialogs nachsprechen und aufnehmen',
  },
  verbs: {
    label: 'Konjugation',
    icon: 'conjugate',
    hint: 'Je Verb fünf Formen richtig bilden',
  },
};

export function isStationKey(value: string | undefined): value is UnitStationKey {
  return value !== undefined && value in STATION_META;
}
