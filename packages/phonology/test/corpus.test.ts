/**
 * Every Arabic text Suffa teaches converts: the words, plurals and dialogue lines of all
 * units and courses. Each sound points at a letter (or the dagger alif), never at a
 * vowel mark or a space.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { g2p } from '../src/index.js';

const CONTENT = fileURLToPath(new URL('../../../apps/web/src/content', import.meta.url));
const ARABIC_FIELDS = new Set(['ar', 'plural']);

/** An Arabic letter (hamza to yāʾ) or the dagger alif. */
const isLetter = (code: number) => (code >= 0x621 && code <= 0x64a) || code === 0x670;

function jsonFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return jsonFiles(path);
    return name.endsWith('.json') ? [path] : [];
  });
}

function arabicTexts(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => arabicTexts(v, out));
  else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      if (ARABIC_FIELDS.has(key) && typeof v === 'string') out.push(v);
      else arabicTexts(v, out);
    }
  }
  return out;
}

const texts = [
  ...new Set(
    jsonFiles(CONTENT).flatMap((file) =>
      arabicTexts(JSON.parse(readFileSync(file, 'utf8')))
    )
  ),
];

describe('content corpus', () => {
  it('finds the texts of all units', () => {
    expect(texts.length).toBeGreaterThan(1000);
  });

  it('converts every word and dialogue line, each sound pointing at a letter', () => {
    const failures: string[] = [];
    for (const text of texts) {
      try {
        const { phones } = g2p(text);
        if (phones.length === 0) failures.push(`${text}: no sounds`);
        for (const phone of phones) {
          if (!isLetter(text.charCodeAt(phone.letter))) {
            failures.push(`${text}: ${phone.ipa} points at "${text[phone.letter]}"`);
          }
        }
      } catch (error) {
        failures.push(`${text}: ${(error as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
