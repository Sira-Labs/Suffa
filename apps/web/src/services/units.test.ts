import { describe, expect, it } from 'vitest';
import index from '@/content/sources/book1-audio.json';
import type { AudioUnit } from '@/types';
import { arabicNumber, splitUnitTitle, unitProgress, unitStations } from './units';

const unit1 = index.units[0] as AudioUnit;
const none = { total: 0, started: 0, mature: 0 };

describe('unitStations', () => {
  it('turns the publisher lessons of unit 1 into a path', () => {
    const stations = unitStations({
      unit: unit1,
      isHeard: () => false,
      vocab: { total: 5, started: 0, mature: 0 },
      testPassed: false,
    });
    expect(stations.map((s) => s.label)).toEqual([
      'Dialog 1',
      'Dialog 2',
      'Dialog 3',
      'Vokabeln lernen',
      'Wortschatz & Strukturen',
      'Übungen',
      'Laute & Hörverstehen',
      'Wiederholung',
      'Einheitstest',
    ]);
    expect(stations[0]).toMatchObject({
      state: 'current',
      to: '/library?unit=1&lesson=1',
    });
    expect(stations[3]).toMatchObject({ kind: 'vocab', to: '/review?unit=1', total: 5 });
    expect(stations.at(-1)).toMatchObject({ kind: 'test', to: '/exam?unit=1' });
  });

  it('marks heard lessons done and moves "current" on', () => {
    const firstLesson = unit1.lessons[0]!.tracks.map((t) => t.url);
    const stations = unitStations({
      unit: unit1,
      isHeard: (url) => firstLesson.includes(url),
      vocab: none,
      testPassed: false,
    });
    expect(stations[0]).toMatchObject({ state: 'done', done: 3, total: 3 });
    expect(stations[1]!.state).toBe('current');
    expect(stations.some((s) => s.kind === 'vocab')).toBe(false);
  });

  it('counts a passed test and reports progress', () => {
    const stations = unitStations({
      unit: unit1,
      isHeard: () => true,
      vocab: { total: 2, started: 2, mature: 1 },
      testPassed: true,
    });
    expect(stations.every((s) => s.state === 'done')).toBe(true);
    expect(unitProgress(stations)).toMatchObject({ percent: 100 });
    expect(
      unitProgress(
        unitStations({
          unit: unit1,
          isHeard: () => false,
          vocab: none,
          testPassed: false,
        })
      ).percent
    ).toBe(0);
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
