import type { IconName } from '@/components/Icon';
import type { PracticeSkill } from '@/types';

/** Stations that open inside a unit, by URL segment (/units/:unit/:station). */
export type UnitStationKey = 'listen' | PracticeSkill;

/**
 * Icon per station; label and hints are in the `units` catalogue under
 * `stations.<key>` (label, hint, sectionHint for a single dialogue).
 */
export const STATION_META: Record<UnitStationKey, { icon: IconName }> = {
  listen: { icon: 'listen' },
  read: { icon: 'read' },
  grammar: { icon: 'roots' },
  cloze: { icon: 'read' },
  write: { icon: 'write' },
  speak: { icon: 'speak' },
  verbs: { icon: 'conjugate' },
};

export function isStationKey(value: string | undefined): value is UnitStationKey {
  return value !== undefined && value in STATION_META;
}
