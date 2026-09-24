/**
 * A unit as a learning path: one focused section per dialogue (listen, read, its words,
 * write, speak), then a closing section with the publisher's exercises, verbs and the unit
 * test. Only the current section is open, so the learner is never shown everything at once.
 * Pure, so pages stay thin views.
 */
import type { AudioLesson, AudioUnit, AudioTrackKind, PracticeSkill } from '@/types';
import type { UnitSection } from '@/services/practice/sections';

export type StationKind =
  | 'dialogue'
  | 'words'
  | 'practice'
  | 'sounds'
  | 'review'
  | 'vocab'
  | 'test'
  | 'video'
  | PracticeSkill;

/** Optional stations not done yet are shown as "optional" instead of "upcoming". */
export type StationState = 'done' | 'current' | 'upcoming' | 'optional';

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
  /** Offered but never blocks the path or counts toward progress (videos, speaking). */
  optional?: boolean;
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
  /** The unit's own dialogues with their words (see dialogueSections). */
  sections: readonly UnitSection[];
  /** Has the learner studied this word at least once? */
  wordStarted: (wordId: string) => boolean;
  /** Is this practice item done? */
  practised: (skill: PracticeSkill, itemId: string) => boolean;
  /** Verb ids of the unit (drilled in the closing section). */
  verbIds?: readonly string[];
  /** The learner's own words for this unit (studied in the closing section). */
  ownWordIds?: readonly string[];
  testPassed: boolean;
  /** The publisher's page videos for this unit, if any. */
  videos?: { count: number; from: number; to: number } | null;
}

/** Done sections fold away, the current one is open, later ones stay hidden until reached. */
export type SectionState = 'done' | 'current' | 'locked';

export interface PathSection {
  id: string;
  /** Dialogue number, or null for the closing section (exercises, verbs, test). */
  no: number | null;
  /** Learner-facing (German). */
  label: string;
  /** Arabic dialogue title, if any. */
  title: string | null;
  stations: Station[];
  state: SectionState;
}

function has(lesson: AudioLesson, ...kinds: AudioTrackKind[]): boolean {
  return lesson.tracks.some((t) => kinds.includes(t.kind));
}

/** Station kind and label of a publisher lesson outside the dialogue sections. */
function describeLesson(lesson: AudioLesson): {
  kind: StationKind;
  label: string;
  detail: string;
} {
  if (has(lesson, 'dialogue')) {
    return { kind: 'dialogue', label: 'Weiterer Dialog', detail: 'Hören' };
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

type Draft = Omit<Station, 'state'>;

function listenStation(input: UnitPathInput, lesson: AudioLesson, extra = ''): Draft {
  const { unit } = input;
  return {
    id: `u${unit.unit}-l${lesson.lesson}`,
    kind: 'dialogue',
    label: 'Dialog hören',
    detail: has(lesson, 'vocabulary') ? 'Verlags-Audio mit Wortschatz' : 'Verlags-Audio',
    to: `/units/${unit.unit}/listen?lesson=${lesson.lesson}${extra}`,
    done: lesson.tracks.filter((t) => input.isHeard(t.url)).length,
    total: lesson.tracks.length,
  };
}

function count(ids: readonly string[], test: (id: string) => boolean): number {
  return ids.filter(test).length;
}

/** Stations of one dialogue section: listen, read, words, write, then speak (optional). */
function sectionStations(
  input: UnitPathInput,
  section: UnitSection,
  lesson: AudioLesson | undefined
): Draft[] {
  const u = input.unit.unit;
  const q = `section=${section.no}`;
  const drafts: Draft[] = [];
  if (section.no === 1 && input.videos && input.videos.count > 0) {
    drafts.push({
      id: `u${u}-video`,
      kind: 'video',
      label: 'Buchseiten-Videos',
      detail: `${input.videos.count} Videos · Buch S. ${input.videos.from}–${input.videos.to}`,
      to: `/units/${u}/listen?view=videos`,
      done: 0,
      total: 0,
      optional: true,
    });
  }
  if (lesson) drafts.push(listenStation(input, lesson, `&${q}`));
  const read = input.practised('read', section.dialogId) ? 1 : 0;
  drafts.push({
    id: `u${u}-s${section.no}-read`,
    kind: 'read',
    label: 'Dialog lesen',
    detail: read ? 'Gelesen und verstanden' : 'Lesen, dann die Verständnisfrage',
    to: `/units/${u}/read?${q}`,
    done: read,
    total: 1,
  });
  const words = section.wordIds;
  if (words.length > 0) {
    drafts.push({
      id: `u${u}-s${section.no}-vocab`,
      kind: 'vocab',
      label: 'Wörter lernen',
      detail: `${count(words, input.wordStarted)} von ${words.length} Wörtern gestartet`,
      to: `/review?unit=${u}&${q}`,
      done: count(words, input.wordStarted),
      total: words.length,
    });
  }
  if (section.writeIds.length > 0) {
    const written = count(section.writeIds, (id) => input.practised('write', id));
    drafts.push({
      id: `u${u}-s${section.no}-write`,
      kind: 'write',
      label: 'Schreiben',
      detail: `${written} von ${section.writeIds.length} Aufgaben · Abschreiben bis Übersetzen`,
      to: `/units/${u}/write?${q}`,
      done: written,
      total: section.writeIds.length,
    });
  }
  if (section.lineIds.length > 0) {
    const spoken = count(section.lineIds, (id) => input.practised('speak', id));
    drafts.push({
      id: `u${u}-s${section.no}-speak`,
      kind: 'speak',
      label: 'Nachsprechen',
      detail: `${spoken} von ${section.lineIds.length} Sätzen gesprochen`,
      to: `/units/${u}/speak?${q}`,
      done: spoken,
      total: section.lineIds.length,
      optional: true,
    });
  }
  return drafts;
}

/** The closing section: the publisher's remaining lessons, own words, verbs, the test. */
function closingStations(input: UnitPathInput, lessons: AudioLesson[]): Draft[] {
  const u = input.unit.unit;
  const drafts: Draft[] = lessons.map((lesson) => ({
    id: `u${u}-l${lesson.lesson}`,
    ...describeLesson(lesson),
    to: `/units/${u}/listen?lesson=${lesson.lesson}`,
    done: lesson.tracks.filter((t) => input.isHeard(t.url)).length,
    total: lesson.tracks.length,
  }));
  const own = input.ownWordIds ?? [];
  if (own.length > 0) {
    drafts.push({
      id: `u${u}-own`,
      kind: 'vocab',
      label: 'Eigene Wörter',
      detail: `${count(own, input.wordStarted)} von ${own.length} Wörtern gestartet`,
      to: `/review?unit=${u}&section=eigene`,
      done: count(own, input.wordStarted),
      total: own.length,
    });
  }
  const verbs = input.verbIds ?? [];
  if (verbs.length > 0) {
    const drilled = count(verbs, (id) => input.practised('verbs', id));
    drafts.push({
      id: `u${u}-verbs`,
      kind: 'verbs',
      label: 'Konjugation',
      detail: `${drilled} von ${verbs.length} Verben geübt`,
      to: `/units/${u}/verbs`,
      done: drilled,
      total: verbs.length,
    });
  }
  drafts.push({
    id: `u${u}-test`,
    kind: 'test',
    label: 'Einheitstest',
    detail: input.testPassed ? 'Bestanden (≥ 80 %)' : 'Gemischte Prüfung zur Einheit',
    to: `/exam?unit=${u}`,
    done: input.testPassed ? 1 : 0,
    total: 1,
  });
  return drafts;
}

function isDone(d: Draft): boolean {
  return d.optional === true || (d.total > 0 && d.done >= d.total);
}

/**
 * The unit as focused sections: one per own dialogue (the publisher's k-th dialogue lesson,
 * reading, its words, writing, speaking), then a closing section. Only the first unfinished
 * section is open; the ones after it stay locked, so the learner sees one dialogue at a time.
 */
export function unitPath(input: UnitPathInput): PathSection[] {
  const u = input.unit.unit;
  const dialogueLessons = input.unit.lessons.filter((l) => has(l, 'dialogue'));
  const used = new Set<number>();
  const groups: Omit<PathSection, 'state' | 'stations'>[] = [];
  const drafts: Draft[][] = [];
  for (const section of input.sections) {
    const lesson = dialogueLessons[section.no - 1];
    if (lesson) used.add(lesson.lesson);
    groups.push({
      id: `u${u}-s${section.no}`,
      no: section.no,
      label: `Dialog ${section.no}`,
      title: section.title,
    });
    drafts.push(sectionStations(input, section, lesson));
  }
  groups.push({ id: `u${u}-close`, no: null, label: 'Abschluss', title: null });
  drafts.push(
    closingStations(
      input,
      input.unit.lessons.filter((l) => !used.has(l.lesson))
    )
  );

  let open = false;
  return groups.map((group, i) => {
    const list = drafts[i]!;
    const done = list.every(isDone);
    const state: SectionState = open ? 'locked' : done ? 'done' : 'current';
    if (state === 'current') open = true;
    let currentAssigned = false;
    const stations = list.map((s): Station => {
      let st: StationState = 'upcoming';
      if (s.total > 0 && s.done >= s.total) st = 'done';
      else if (s.optional) st = 'optional';
      else if (state === 'current' && !currentAssigned) {
        st = 'current';
        currentAssigned = true;
      }
      return { ...s, state: st };
    });
    return { ...group, stations, state };
  });
}

/** Share of the unit done, by station items (tracks, words, practice, test). */
export function unitProgress(sections: readonly PathSection[]): {
  doneSections: number;
  sections: number;
  percent: number;
} {
  const counted = sections.flatMap((s) => s.stations).filter((s) => !s.optional);
  const done = counted.reduce((n, s) => n + Math.min(s.done, s.total), 0);
  const total = counted.reduce((n, s) => n + s.total, 0);
  return {
    doneSections: sections.filter((s) => s.state === 'done').length,
    sections: sections.length,
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
