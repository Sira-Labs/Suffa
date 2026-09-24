import { describe, expect, it } from 'vitest';
import { content } from '@/content';

describe('grammar points', () => {
  it('gives every unit one point per dialogue section', () => {
    for (let unit = 1; unit <= 16; unit++) {
      const points = content.grammatik.filter((p) => p.einheit === unit);
      const sections = content.dialoge.filter((d) => d.einheit === unit).length;
      expect(points.map((p) => p.abschnitt).sort()).toEqual(
        Array.from({ length: sections }, (_, i) => i + 1)
      );
    }
  });

  it('has unique ids and well-formed questions', () => {
    const ids = content.grammatik.flatMap((p) => [p.id, ...p.fragen.map((q) => q.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const point of content.grammatik) {
      expect(point.beispiele.length).toBeGreaterThan(0);
      expect(point.fragen.length).toBeGreaterThanOrEqual(2);
      for (const q of point.fragen) {
        expect(q.id.startsWith(`${point.id}#`)).toBe(true);
        expect(q.ablenker).toHaveLength(3);
        expect(q.ablenker).not.toContain(q.antwort);
        expect(new Set(q.ablenker).size).toBe(3);
      }
    }
  });

  it('writes Arabic examples with harakat', () => {
    const harakat = /[\u064B-\u0652\u0670]/;
    for (const point of content.grammatik) {
      for (const example of point.beispiele) expect(example.ar).toMatch(harakat);
    }
  });
});
