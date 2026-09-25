import { describe, expect, it } from 'vitest';
import { displayName, goalPercent, rankLeague } from '../src/classes/league.js';

const entry = (userId: string, name: string | null, activeDays: number, goal = 5) => ({
  userId,
  name,
  activeDays,
  goal,
});

describe('weekly league ranking (story 14.2)', () => {
  it('scores the share of the own goal, capped at 100 %', () => {
    expect(goalPercent(2, 3)).toBe(66);
    expect(goalPercent(7, 5)).toBe(100);
    expect(goalPercent(0, 7)).toBe(0);
    expect(goalPercent(1, 0)).toBe(0);
  });

  it('lets beginners win: 3 of 3 beats 5 of 7', () => {
    const { podium } = rankLeague(
      [entry('a', 'Amina', 3, 3), entry('b', 'Bilal', 5, 7)],
      'x',
      false
    );
    expect(podium.map((p) => [p.place, p.name, p.percent])).toEqual([
      [1, 'Amina', 100],
      [2, 'Bilal', 71],
    ]);
  });

  it('shares places on ties, names at most three places and never the rest', () => {
    const { podium, participants, you } = rankLeague(
      [
        entry('a', 'Amina', 5),
        entry('b', 'Bilal', 5),
        entry('c', 'Chadi', 4),
        entry('d', 'Dunya', 3),
        entry('e', 'Emre', 2),
        entry('f', 'Farah', 0),
      ],
      'e',
      false
    );
    expect(participants).toBe(6);
    expect(podium.map((p) => [p.place, p.name, p.title])).toEqual([
      [1, 'Amina', 'Wochen-Stern'],
      [1, 'Bilal', 'Wochen-Stern'],
      [2, 'Chadi', 'Wochen-Held'],
      [3, 'Dunya', 'Wochen-Talent'],
    ]);
    // Emre is not on the podium and sees only his own week, no rank.
    expect(you).toEqual({ percent: 40, activeDays: 2, goal: 5, onPodium: false });
  });

  it('puts nobody without progress on the podium', () => {
    expect(rankLeague([entry('a', 'Amina', 0)], 'a', false).podium).toEqual([]);
  });

  it('shows first names only in a class of minors', () => {
    expect(displayName('Bilal Yilmaz', true)).toBe('Bilal');
    expect(displayName('Bilal Yilmaz', false)).toBe('Bilal Yilmaz');
    expect(displayName('  ', true)).toBe('Jemand aus der Klasse');
  });
});
