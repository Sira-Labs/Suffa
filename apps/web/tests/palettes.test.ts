import { PALETTE_IDS } from '@suffa/engagement';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PALETTES,
  PALETTE_TOKENS,
  applyPalette,
  effectivePalette,
  type PaletteColours,
} from '@/theme/palettes';

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Text tokens that must read on every surface, at 4.5:1 (WCAG 1.4.3). */
const TEXT = ['text', 'text-muted', 'accent', 'good', 'warn', 'bad', 'info'] as const;
const SURFACES = ['bg', 'bg-elev', 'bg-elev-2'] as const;

function problems(c: PaletteColours): string[] {
  const out: string[] = [];
  for (const fg of TEXT) {
    for (const bg of SURFACES) {
      const ratio = contrast(c[fg], c[bg]);
      if (ratio < 4.5) out.push(`${fg} on ${bg}: ${ratio.toFixed(2)}`);
    }
  }
  const pairs: [string, string, number][] = [
    ['on-accent', 'accent-fill', 4.5],
    ['on-accent-2', 'accent-2', 4.5],
    ['on-paper', 'paper', 4.5],
    ['on-paper-muted', 'paper', 4.5],
    // Focus rings and borders of controls (WCAG 1.4.11, 2.4.13): 3:1.
    ['focus', 'bg', 3],
    ['focus', 'bg-elev', 3],
  ];
  for (const [fg, bg, min] of pairs) {
    const ratio = contrast(c[fg as keyof PaletteColours], c[bg as keyof PaletteColours]);
    if (ratio < min) out.push(`${fg} on ${bg}: ${ratio.toFixed(2)}`);
  }
  return out;
}

afterEach(() => {
  applyPalette('oase', 'dark');
});

describe('colour schemes', () => {
  it('has one palette per id, with every token in both themes', () => {
    expect(Object.keys(PALETTES).sort()).toEqual([...PALETTE_IDS].sort());
    for (const palette of Object.values(PALETTES)) {
      for (const mode of ['dark', 'light'] as const) {
        expect(Object.keys(palette[mode]).sort()).toEqual([...PALETTE_TOKENS].sort());
        for (const value of Object.values(palette[mode])) {
          expect(value).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
  });

  it.each(PALETTE_IDS.flatMap((id) => [[id, 'dark'] as const, [id, 'light'] as const]))(
    'keeps WCAG AA contrast: %s %s',
    (id, mode) => {
      expect(problems(PALETTES[id][mode])).toEqual([]);
    }
  );

  it('follows the class unless the learner picked one', () => {
    expect(effectivePalette(undefined, null)).toBe('oase');
    expect(effectivePalette('class', 'meer')).toBe('meer');
    expect(effectivePalette(null, 'sand')).toBe('sand');
    expect(effectivePalette('lavendel', 'meer')).toBe('lavendel');
  });

  it('sets the tokens on <html>, and the default one leaves the stylesheet alone', () => {
    const root = document.documentElement;
    applyPalette('meer', 'light');
    expect(root.dataset.palette).toBe('meer');
    expect(root.style.getPropertyValue('--bg')).toBe(PALETTES.meer.light.bg);
    applyPalette('oase', 'light');
    expect(root.style.getPropertyValue('--bg')).toBe('');
  });
});
