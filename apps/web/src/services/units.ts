/**
 * A unit as a learning path: one focused section per dialogue (listen, read, its words,
 * write, speak), then a closing section with the publisher's exercises, verbs and the unit
 * test. Only the current section is open, so the learner is never shown everything at once.
 * Pure, so pages stay thin views; labels come in the interface language (story 16.3).
 */
import i18n from '@/i18n';
import type { AudioLesson, AudioUnit, AudioTrackKind, PracticeSkill } from '@/types';
import type { UnitSection } from '@/services/practice/sections';

/** Looks up an interface text; the path labels are `units:pathStations.*`. */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

const defaultTranslate: Translate = (key, options) =>
  (i18n as unknown as { t: Translate }).t(key, options);

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
  /** Learner-facing, in the interface language. */
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
  /** Words with a cloze task (example sentences load on demand; none until then). */
  clozeIds?: ReadonlySet<string>;
  /** Verb ids of the unit (drilled in the closing section). */
  verbIds?: readonly string[];
  /** The learner's own words for this unit (studied in the closing section). */
  ownWordIds?: readonly string[];
  testPassed: boolean;
  /** The publisher's page videos for this unit, if any. */
  videos?: { count: number; from: number; to: number } | null;
  /**
   * Translates the labels; pages pass `t` from useTranslation so the path follows a language
   * switch. Defaults to the current interface language.
   */
  t?: Translate;
}

/** Done sections fold away, the current one is open, later ones stay hidden until reached. */
export type SectionState = 'done' | 'current' | 'locked';

export interface PathSection {
  id: string;
  /** Dialogue number, or null for the closing section (exercises, verbs, test). */
  no: number | null;
  /** Learner-facing, in the interface language. */
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
function describeLesson(
  lesson: AudioLesson,
  t: Translate
): {
  kind: StationKind;
  label: string;
  detail: string;
} {
  const station = (kind: StationKind, key: string) => ({
    kind,
    label: t(`units:pathStations.${key}.label`),
    detail: t(`units:pathStations.${key}.detail`),
  });
  if (has(lesson, 'dialogue')) return station('dialogue', 'moreDialogue');
  if (has(lesson, 'sounds', 'listening')) return station('sounds', 'sounds');
  if (has(lesson, 'exercise-example')) return station('practice', 'practice');
  if (has(lesson, 'vocabulary')) return station('words', 'vocabulary');
  return station('review', 'review');
}

type Draft = Omit<Station, 'state'>;

function listenStation(
  input: UnitPathInput,
  t: Translate,
  lesson: AudioLesson,
  extra = ''
): Draft {
  const { unit } = input;
  return {
    id: `u${unit.unit}-l${lesson.lesson}`,
    kind: 'dialogue',
    label: t('units:pathStations.listen.label'),
    detail: t(
      has(lesson, 'vocabulary')
        ? 'units:pathStations.listen.detailWords'
        : 'units:pathStations.listen.detail'
    ),
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
  t: Translate,
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
      label: t('units:pathStations.video.label'),
      detail: t('units:pathStations.video.detail', {
        count: input.videos.count,
        from: input.videos.from,
        to: input.videos.to,
      }),
      to: `/units/${u}/listen?view=videos`,
      done: 0,
      total: 0,
      optional: true,
    });
  }
  if (lesson) drafts.push(listenStation(input, t, lesson, `&${q}`));
  const read = input.practised('read', section.dialogId) ? 1 : 0;
  drafts.push({
    id: `u${u}-s${section.no}-read`,
    kind: 'read',
    label: t('units:pathStations.read.label'),
    detail: t(read ? 'units:pathStations.read.done' : 'units:pathStations.read.open'),
    to: `/units/${u}/read?${q}`,
    done: read,
    total: 1,
  });
  if (section.grammarIds.length > 0) {
    const answered = count(section.grammarIds, (id) => input.practised('grammar', id));
    drafts.push({
      id: `u${u}-s${section.no}-grammar`,
      kind: 'grammar',
      label: t('units:pathStations.grammar.label'),
      detail: t('units:pathStations.grammar.detail', {
        done: answered,
        total: section.grammarIds.length,
      }),
      to: `/units/${u}/grammar?${q}`,
      done: answered,
      total: section.grammarIds.length,
    });
  }
  const words = section.wordIds;
  if (words.length > 0) {
    drafts.push({
      id: `u${u}-s${section.no}-vocab`,
      kind: 'vocab',
      label: t('units:pathStations.vocab.label'),
      detail: t('units:pathStations.vocab.detail', {
        done: count(words, input.wordStarted),
        total: words.length,
      }),
      to: `/review?unit=${u}&${q}`,
      done: count(words, input.wordStarted),
      total: words.length,
    });
  }
  const cloze = words.filter((id) => input.clozeIds?.has(id));
  if (cloze.length > 0) {
    const filled = count(cloze, (id) => input.practised('cloze', id));
    drafts.push({
      id: `u${u}-s${section.no}-cloze`,
      kind: 'cloze',
      label: t('units:pathStations.cloze.label'),
      detail: t('units:pathStations.cloze.detail', { done: filled, total: cloze.length }),
      to: `/units/${u}/cloze?${q}`,
      done: filled,
      total: cloze.length,
    });
  }
  if (section.writeIds.length > 0) {
    const written = count(section.writeIds, (id) => input.practised('write', id));
    drafts.push({
      id: `u${u}-s${section.no}-write`,
      kind: 'write',
      label: t('units:pathStations.write.label'),
      detail: t('units:pathStations.write.detail', {
        done: written,
        total: section.writeIds.length,
      }),
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
      label: t('units:pathStations.speak.label'),
      detail: t('units:pathStations.speak.detail', {
        done: spoken,
        total: section.lineIds.length,
      }),
      to: `/units/${u}/speak?${q}`,
      done: spoken,
      total: section.lineIds.length,
      optional: true,
    });
  }
  return drafts;
}

/** The closing section: the publisher's remaining lessons, own words, verbs, the test. */
function closingStations(
  input: UnitPathInput,
  t: Translate,
  lessons: AudioLesson[]
): Draft[] {
  const u = input.unit.unit;
  const drafts: Draft[] = lessons.map((lesson) => ({
    id: `u${u}-l${lesson.lesson}`,
    ...describeLesson(lesson, t),
    to: `/units/${u}/listen?lesson=${lesson.lesson}`,
    done: lesson.tracks.filter((t) => input.isHeard(t.url)).length,
    total: lesson.tracks.length,
  }));
  const own = input.ownWordIds ?? [];
  if (own.length > 0) {
    drafts.push({
      id: `u${u}-own`,
      kind: 'vocab',
      label: t('units:pathStations.own.label'),
      detail: t('units:pathStations.own.detail', {
        done: count(own, input.wordStarted),
        total: own.length,
      }),
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
      label: t('units:pathStations.verbs.label'),
      detail: t('units:pathStations.verbs.detail', {
        done: drilled,
        total: verbs.length,
      }),
      to: `/units/${u}/verbs`,
      done: drilled,
      total: verbs.length,
    });
  }
  drafts.push({
    id: `u${u}-test`,
    kind: 'test',
    label: t('units:pathStations.test.label'),
    detail: t(
      input.testPassed ? 'units:pathStations.test.passed' : 'units:pathStations.test.open'
    ),
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
  const t = input.t ?? defaultTranslate;
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
      label: t('units:dialogue', { n: section.no }),
      title: section.title,
    });
    drafts.push(sectionStations(input, t, section, lesson));
  }
  groups.push({
    id: `u${u}-close`,
    no: null,
    label: t('units:pathStations.closing'),
    title: null,
  });
  drafts.push(
    closingStations(
      input,
      t,
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
