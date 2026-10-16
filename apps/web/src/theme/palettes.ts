/**
 * Colour schemes (story 18.1). Every palette sets the same design tokens as global.css, for
 * the dark and the light theme, so every module restyles with it. "Oase" is the original look
 * and lives in global.css itself; the others are applied as inline custom properties on
 * <html>, which win over the stylesheet's :root rules.
 *
 * Contrast (WCAG 2.2 AA) is checked for every palette in tests/palettes.test.ts.
 */
import { DEFAULT_PALETTE, type PaletteId } from '@suffa/engagement';

export const PALETTE_TOKENS = [
  'bg',
  'bg-elev',
  'bg-elev-2',
  'text',
  'text-muted',
  'border',
  'accent',
  'accent-2',
  'on-accent-2',
  'accent-fill',
  'on-accent',
  'good',
  'warn',
  'bad',
  'info',
  'focus',
  // The light "paper" cards (word of the day, book pages) in both themes.
  'paper',
  'on-paper',
  'on-paper-muted',
] as const;
export type PaletteToken = (typeof PALETTE_TOKENS)[number];
export type PaletteColours = Record<PaletteToken, string>;
export type ThemeMode = 'dark' | 'light';

/** Browser chrome colour (meta theme-color) per palette. */
export interface Palette {
  id: PaletteId;
  dark: PaletteColours;
  light: PaletteColours;
}

export const PALETTES: Record<PaletteId, Palette> = {
  // The original look (global.css): deep green with saffron.
  oase: {
    id: 'oase',
    dark: {
      bg: '#0f1714',
      'bg-elev': '#17221e',
      'bg-elev-2': '#22302b',
      text: '#f4eee2',
      'text-muted': '#a9b5ae',
      border: '#2e3d37',
      accent: '#e8a93b',
      'accent-2': '#3fb5a3',
      'on-accent-2': '#06201c',
      'accent-fill': '#e8a93b',
      'on-accent': '#1a1206',
      good: '#4cc3a5',
      warn: '#e8a93b',
      bad: '#f08a73',
      info: '#8cc4f2',
      paper: '#f4eee2',
      'on-paper': '#1b2420',
      'on-paper-muted': '#56615b',
      focus: '#f3c274',
    },
    light: {
      bg: '#f6f1e7',
      'bg-elev': '#fffdf8',
      'bg-elev-2': '#ede5d5',
      text: '#1b2420',
      'text-muted': '#56615b',
      border: '#dcd2bf',
      accent: '#8a5a12',
      'accent-2': '#1f7a6d',
      'on-accent-2': '#ffffff',
      'accent-fill': '#e8a93b',
      'on-accent': '#1a1206',
      good: '#1a6e62',
      warn: '#8a5a12',
      bad: '#ab3e26',
      info: '#25609b',
      paper: '#f4eee2',
      'on-paper': '#1b2420',
      'on-paper-muted': '#56615b',
      focus: '#8a5a12',
    },
  },
  // Fresh: sea blue and turquoise with a coral accent.
  meer: {
    id: 'meer',
    dark: {
      bg: '#0c1a22',
      'bg-elev': '#12252f',
      'bg-elev-2': '#1b3440',
      text: '#eef6f8',
      'text-muted': '#a3bcc4',
      border: '#29444f',
      accent: '#6ad3e8',
      'accent-2': '#4fd1b5',
      'on-accent-2': '#04201a',
      'accent-fill': '#f6a07a',
      'on-accent': '#2a1208',
      good: '#5fd3b0',
      warn: '#f2c14e',
      bad: '#f4917c',
      info: '#8ec5f5',
      paper: '#e4f3f6',
      'on-paper': '#10262e',
      'on-paper-muted': '#41585f',
      focus: '#8ae2f2',
    },
    light: {
      bg: '#f2f8fa',
      'bg-elev': '#ffffff',
      'bg-elev-2': '#e1eef2',
      text: '#10262e',
      'text-muted': '#475f67',
      border: '#cbdfe5',
      accent: '#0a6a80',
      'accent-2': '#0f766a',
      'on-accent-2': '#ffffff',
      'accent-fill': '#f6a07a',
      'on-accent': '#2a1208',
      good: '#11714f',
      warn: '#8a5a12',
      bad: '#b13f27',
      info: '#1f5fa8',
      paper: '#e4f3f6',
      'on-paper': '#10262e',
      'on-paper-muted': '#41585f',
      focus: '#0a6a80',
    },
  },
  // Fresh and light: mint and leaf green with sunflower yellow.
  minze: {
    id: 'minze',
    dark: {
      bg: '#0f1d18',
      'bg-elev': '#162a22',
      'bg-elev-2': '#20392f',
      text: '#eef8f2',
      'text-muted': '#a6c2b3',
      border: '#2c4a3d',
      accent: '#7fdcaa',
      'accent-2': '#5fd0cf',
      'on-accent-2': '#03201f',
      'accent-fill': '#7ad9b0',
      'on-accent': '#06231a',
      good: '#7fdcaa',
      warn: '#f5c542',
      bad: '#f4917c',
      info: '#8ec5f5',
      paper: '#e5f5eb',
      'on-paper': '#13281c',
      'on-paper-muted': '#455e4f',
      focus: '#a3ecc4',
    },
    light: {
      bg: '#f3faf5',
      'bg-elev': '#ffffff',
      'bg-elev-2': '#e0f1e6',
      text: '#13281c',
      'text-muted': '#4a6354',
      border: '#cbe2d3',
      accent: '#1b7346',
      'accent-2': '#0e7472',
      'on-accent-2': '#ffffff',
      'accent-fill': '#7ad9b0',
      'on-accent': '#06231a',
      good: '#1b7346',
      warn: '#855610',
      bad: '#b13f27',
      info: '#25609b',
      paper: '#e5f5eb',
      'on-paper': '#13281c',
      'on-paper-muted': '#455e4f',
      focus: '#1b7346',
    },
  },
  // Calm: lavender with gold.
  lavendel: {
    id: 'lavendel',
    dark: {
      bg: '#15111f',
      'bg-elev': '#1e1830',
      'bg-elev-2': '#2a2241',
      text: '#f2eefa',
      'text-muted': '#b4abc9',
      border: '#3a3054',
      accent: '#c8b6ff',
      'accent-2': '#6fd6c4',
      'on-accent-2': '#062019',
      'accent-fill': '#c4b3ff',
      'on-accent': '#1b1233',
      good: '#6fd6c4',
      warn: '#f0c674',
      bad: '#f59a87',
      info: '#9cc8f5',
      paper: '#eee8fa',
      'on-paper': '#221b33',
      'on-paper-muted': '#564f6c',
      focus: '#d8caff',
    },
    light: {
      bg: '#f7f5fb',
      'bg-elev': '#ffffff',
      'bg-elev-2': '#ebe6f5',
      text: '#221b33',
      'text-muted': '#5a5370',
      border: '#ddd5ec',
      accent: '#5a3ea6',
      'accent-2': '#1f7a6d',
      'on-accent-2': '#ffffff',
      'accent-fill': '#c4b3ff',
      'on-accent': '#1b1233',
      good: '#1a6e62',
      warn: '#855610',
      bad: '#b13f27',
      info: '#25609b',
      paper: '#eee8fa',
      'on-paper': '#221b33',
      'on-paper-muted': '#564f6c',
      focus: '#5a3ea6',
    },
  },
  // Warm: sand and terracotta with a blue second accent.
  sand: {
    id: 'sand',
    dark: {
      bg: '#1a1410',
      'bg-elev': '#241c16',
      'bg-elev-2': '#322720',
      text: '#f7efe6',
      'text-muted': '#c2b2a2',
      border: '#45372d',
      accent: '#f2a477',
      'accent-2': '#7cc6e6',
      'on-accent-2': '#071c26',
      'accent-fill': '#f0a36b',
      'on-accent': '#2a1206',
      good: '#7dd3a0',
      warn: '#f2c14e',
      bad: '#f59a87',
      info: '#8ec5f5',
      paper: '#f7ebdd',
      'on-paper': '#2a1f17',
      'on-paper-muted': '#62523f',
      focus: '#f6b98f',
    },
    light: {
      bg: '#faf6f0',
      'bg-elev': '#ffffff',
      'bg-elev-2': '#f1e8db',
      text: '#2a1f17',
      'text-muted': '#665647',
      border: '#e4d7c5',
      accent: '#9c421c',
      'accent-2': '#2b6a89',
      'on-accent-2': '#ffffff',
      'accent-fill': '#f0a36b',
      'on-accent': '#2a1206',
      good: '#2b7349',
      warn: '#855610',
      bad: '#b13f27',
      info: '#2b6a89',
      paper: '#f7ebdd',
      'on-paper': '#2a1f17',
      'on-paper-muted': '#62523f',
      focus: '#9c421c',
    },
  },
};

/** The palette in effect: the learner's own pick, else their class's, else the default. */
export function effectivePalette(
  own: PaletteId | 'class' | null | undefined,
  fromClass: PaletteId | null | undefined
): PaletteId {
  if (own && own !== 'class') return own;
  return fromClass ?? DEFAULT_PALETTE;
}

/**
 * Applies a palette to <html>. The default one removes the inline tokens again, so the
 * stylesheet's own values (and their media rules) take over.
 */
export function applyPalette(
  id: PaletteId,
  mode: ThemeMode,
  root: HTMLElement = document.documentElement
): void {
  root.dataset.palette = id;
  for (const token of PALETTE_TOKENS) {
    if (id === DEFAULT_PALETTE) root.style.removeProperty(`--${token}`);
    else root.style.setProperty(`--${token}`, PALETTES[id][mode][token]);
  }
  const meta = root.ownerDocument.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]'
  );
  meta?.setAttribute('content', PALETTES[id][mode].bg);
}
