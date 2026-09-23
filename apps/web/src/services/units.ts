/**
 * A unit as a learning path (redesign step 3): stations derived from the publisher's lesson
 * structure (dialogues, vocabulary, exercises, sounds and listening, review), plus the
 * learner's own vocabulary cards and the unit test. Pure, so pages stay thin views.
 */
import type { AudioLesson, AudioUnit, AudioTrackKind } from '@/types';

export type StationKind =
  | 'dialogue'
  | 'words'
  | 'practice'
  | 'sounds'
  | 'review'
  | 'vocab'
  | 'test';

export type StationState = 'done' | 'current' | 'upcoming';

export interface Station {
  id: string;
  kind: StationKind;
  /** Learner-facing (German). */
  label: string;
  detail: string;
  to: string;
  done: number;
  total: number;
  state: StationState;
}

export interface VocabStats {
  /** Words of this unit (content + own words). */
  total: number;
  /** Words studied at least once. */
  started: number;
  /** Words with a mature card (interval ≥ 21 days). */
  mature: number;
}

export interface UnitPathInput {
  unit: AudioUnit;
  /** Is this audio track heard? (by URL) */
  isHeard: (url: string) => boolean;
  vocab: VocabStats;
  testPassed: boolean;
}

function has(lesson: AudioLesson, ...kinds: AudioTrackKind[]): boolean {
  return lesson.tracks.some((t) => kinds.includes(t.kind));
}

/** Station kind and label from what a lesson contains. */
function describeLesson(
  lesson: AudioLesson,
  dialogueNo: number
): { kind: StationKind; label: string; detail: string } {
  if (has(lesson, 'dialogue')) {
    return {
      kind: 'dialogue',
      label: `Dialog ${dialogueNo}`,
      detail: has(lesson, 'vocabulary') ? 'Hören und Wortschatz' : 'Hören',
    };
  }
  if (has(lesson, 'sounds', 'listening')) {
    return {
      kind: 'sounds',
      label: 'Laute & Hörverstehen',
      detail: 'Aussprache und Hörübungen',
    };
  }
  if (has(lesson, 'exercise-example')) {
    return { kind: 'practice', label: 'Übungen', detail: 'Beispiel hören, dann selbst' };
  }
  if (has(lesson, 'vocabulary')) {
    return {
      kind: 'words',
      label: 'Wortschatz & Strukturen',
      detail: 'Neue Wörter und Muster',
    };
  }
  return { kind: 'review', label: 'Wiederholung', detail: 'Zum Abschluss der Einheit' };
}

/** Stations in learning order; the first unfinished one is "current". */
export function unitStations(input: UnitPathInput): Station[] {
  const { unit } = input;
  const stations: Omit<Station, 'state'>[] = [];
  let dialogueNo = 0;
  let vocabInserted = false;

  const vocabStation = (): Omit<Station, 'state'> => ({
    id: `u${unit.unit}-vocab`,
    kind: 'vocab',
    label: 'Vokabeln lernen',
    detail: `${input.vocab.started} von ${input.vocab.total} Wörtern gestartet · ${input.vocab.mature} sicher`,
    to: `/review?unit=${unit.unit}`,
    done: input.vocab.started,
    total: input.vocab.total,
  });

  for (const lesson of unit.lessons) {
    const isDialogue = has(lesson, 'dialogue');
    // Own vocabulary cards right after the dialogues, where the words were introduced.
    if (!isDialogue && dialogueNo > 0 && !vocabInserted && input.vocab.total > 0) {
      stations.push(vocabStation());
      vocabInserted = true;
    }
    if (isDialogue) dialogueNo += 1;
    const { kind, label, detail } = describeLesson(lesson, dialogueNo);
    stations.push({
      id: `u${unit.unit}-l${lesson.lesson}`,
      kind,
      label,
      detail,
      to: `/library?unit=${unit.unit}&lesson=${lesson.lesson}`,
      done: lesson.tracks.filter((t) => input.isHeard(t.url)).length,
      total: lesson.tracks.length,
    });
  }
  if (!vocabInserted && input.vocab.total > 0) stations.push(vocabStation());

  stations.push({
    id: `u${unit.unit}-test`,
    kind: 'test',
    label: 'Einheitstest',
    detail: input.testPassed ? 'Bestanden (≥ 80 %)' : 'Gemischte Prüfung zur Einheit',
    to: `/exam?unit=${unit.unit}`,
    done: input.testPassed ? 1 : 0,
    total: 1,
  });

  let currentAssigned = false;
  return stations.map((s) => {
    let state: StationState = 'upcoming';
    if (s.total > 0 && s.done >= s.total) state = 'done';
    else if (!currentAssigned) {
      state = 'current';
      currentAssigned = true;
    }
    return { ...s, state };
  });
}

/** Share of the unit done, by station items (tracks, words, test). */
export function unitProgress(stations: Station[]): {
  doneStations: number;
  stations: number;
  percent: number;
} {
  const done = stations.reduce((n, s) => n + Math.min(s.done, s.total), 0);
  const total = stations.reduce((n, s) => n + s.total, 0);
  return {
    doneStations: stations.filter((s) => s.state === 'done').length,
    stations: stations.length,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

/** Arabic-Indic digits for unit numbers (٤ for 4). */
export function arabicNumber(n: number): string {
  return new Intl.NumberFormat('ar-EG', { useGrouping: false }).format(n);
}

/** Splits a content title "التحية والتعارف – Begrüßung …" into its Arabic and German parts. */
export function splitUnitTitle(title: string): { ar: string | null; de: string } {
  const [first, ...rest] = title.split(/\s+[–-]\s+/);
  if (rest.length > 0 && first && /[\u0600-\u06FF]/.test(first)) {
    return { ar: first.trim(), de: rest.join(' – ').trim() };
  }
  return { ar: null, de: title };
}
