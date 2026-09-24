import { describe, expect, it } from 'vitest';
import index from '@/content/sources/book1-audio.json';
import type { AudioUnit } from '@/types';
import type { UnitSection } from './practice';
import {
  arabicNumber,
  splitUnitTitle,
  unitPath,
  unitProgress,
  type UnitPathInput,
} from './units';

const unit1 = index.units[0] as AudioUnit;

const sections: UnitSection[] = [1, 2, 3].map((no) => ({
  no,
  dialogId: `d-1-${no}`,
  title: `حوار ${no}`,
  wordIds: [`w${no}a`, `w${no}b`],
  lineIds: [`d-1-${no}#0`, `d-1-${no}#1`],
  writeIds: [`w${no}a`, `diktat:w${no}a`],
  grammarIds: no === 1 ? ['g-1-1#0', 'g-1-1#1'] : [],
}));

function input(overrides: Partial<UnitPathInput> = {}): UnitPathInput {
  return {
    unit: unit1,
    isHeard: () => false,
    sections,
    wordStarted: () => false,
    practised: () => false,
    verbIds: ['vb-1'],
    testPassed: false,
    ...overrides,
  };
}

/** Everything of dialogue sections up to `upTo` done (speaking left open: it is optional). */
function doneUpTo(upTo: number): Partial<UnitPathInput> {
  const lessons = unit1.lessons.filter((l) =>
    l.tracks.some((t) => t.kind === 'dialogue')
  );
  const heard = new Set(
    lessons.slice(0, upTo).flatMap((l) => l.tracks.map((t) => t.url))
  );
  const inSection = (id: string) =>
    Number(/(\d)[ab]?$/.exec(id.replace(/#\d+$/, ''))?.[1]);
  return {
    isHeard: (url) => heard.has(url),
    wordStarted: (id) => inSection(id) <= upTo,
    practised: (skill, id) =>
      skill !== 'speak' && skill !== 'verbs' && inSection(id) <= upTo,
  };
}

describe('unitPath', () => {
  it('opens only dialogue 1 and keeps the rest locked', () => {
    const path = unitPath(input());
    expect(path.map((s) => [s.label, s.state])).toEqual([
      ['Dialog 1', 'current'],
      ['Dialog 2', 'locked'],
      ['Dialog 3', 'locked'],
      ['Abschluss', 'locked'],
    ]);
    expect(path[0]!.stations.map((s) => s.label)).toEqual([
      'Dialog hören',
      'Dialog lesen',
      'Grammatik',
      'Wörter lernen',
      'Schreiben',
      'Nachsprechen',
    ]);
    expect(path[0]!.stations[2]).toMatchObject({
      kind: 'grammar',
      to: '/units/1/grammar?section=1',
      total: 2,
    });
    expect(path[0]!.stations[0]).toMatchObject({
      state: 'current',
      to: '/units/1/listen?lesson=1&section=1',
    });
    expect(path[0]!.stations[3]).toMatchObject({
      to: '/review?unit=1&section=1',
      total: 2,
    });
    expect(path[0]!.stations.at(-1)).toMatchObject({ optional: true, state: 'optional' });
  });

  it('adds a cloze station after the words once example sentences are known', () => {
    const path = unitPath(input({ clozeIds: new Set(['w1a']) }));
    expect(path[0]!.stations.map((s) => s.label)).toEqual([
      'Dialog hören',
      'Dialog lesen',
      'Grammatik',
      'Wörter lernen',
      'Lückentext',
      'Schreiben',
      'Nachsprechen',
    ]);
    expect(path[0]!.stations[4]).toMatchObject({
      to: '/units/1/cloze?section=1',
      total: 1,
    });
    expect(path[1]!.stations.some((s) => s.kind === 'cloze')).toBe(false);
  });

  it("maps the publisher's k-th dialogue lesson to section k", () => {
    const path = unitPath(input());
    expect(path.map((s) => s.stations.find((st) => st.kind === 'dialogue')?.to)).toEqual([
      '/units/1/listen?lesson=1&section=1',
      '/units/1/listen?lesson=2&section=2',
      '/units/1/listen?lesson=3&section=3',
      undefined,
    ]);
  });

  it('moves on to dialogue 2 once dialogue 1 is done, speaking stays optional', () => {
    const path = unitPath(input(doneUpTo(1)));
    expect(path.map((s) => s.state)).toEqual(['done', 'current', 'locked', 'locked']);
    expect(path[1]!.stations[0]!.state).toBe('current');
  });

  it('closes with the remaining lessons, verbs and the unit test', () => {
    const path = unitPath(input(doneUpTo(3)));
    const closing = path.at(-1)!;
    expect(closing.state).toBe('current');
    expect(closing.stations.map((s) => s.label)).toEqual([
      'Wortschatz & Strukturen',
      'Übungen',
      'Laute & Hörverstehen',
      'Wiederholung',
      'Konjugation',
      'Einheitstest',
    ]);
    expect(closing.stations.at(-1)).toMatchObject({ kind: 'test', to: '/exam?unit=1' });
  });

  it('offers page videos in dialogue 1 as optional, never blocking', () => {
    const path = unitPath(input({ videos: { count: 14, from: 1, to: 25 } }));
    expect(path[0]!.stations[0]).toMatchObject({
      kind: 'video',
      state: 'optional',
      detail: '14 Videos · Buch S. 1–25',
      to: '/units/1/listen?view=videos',
    });
    expect(path[0]!.stations[1]!.state).toBe('current');
  });

  it('adds own words to the closing section', () => {
    const path = unitPath(input({ ownWordIds: ['own-1'] }));
    expect(path.at(-1)!.stations.find((s) => s.label === 'Eigene Wörter')).toMatchObject({
      to: '/review?unit=1&section=eigene',
      total: 1,
    });
  });

  it('reports progress by sections, without optional stations', () => {
    expect(unitProgress(unitPath(input()))).toMatchObject({
      doneSections: 0,
      sections: 4,
      percent: 0,
    });
    const all = unitPath(
      input({
        isHeard: () => true,
        wordStarted: () => true,
        practised: () => true,
        testPassed: true,
      })
    );
    expect(all.every((s) => s.state === 'done')).toBe(true);
    expect(unitProgress(all)).toMatchObject({ doneSections: 4, percent: 100 });
  });
});

describe('arabicNumber', () => {
  it('uses Arabic-Indic digits', () => {
    expect(arabicNumber(4)).toBe('٤');
    expect(arabicNumber(16)).toBe('١٦');
  });
});

describe('splitUnitTitle', () => {
  it('separates the Arabic and German parts', () => {
    expect(splitUnitTitle('التحية والتعارف – Begrüßung und Bekanntschaft')).toEqual({
      ar: 'التحية والتعارف',
      de: 'Begrüßung und Bekanntschaft',
    });
    expect(splitUnitTitle('Nur Deutsch')).toEqual({ ar: null, de: 'Nur Deutsch' });
  });
});
