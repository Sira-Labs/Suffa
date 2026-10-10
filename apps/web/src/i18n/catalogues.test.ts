/**
 * The catalogues (story 16.3): English has every German key (also enforced by the types),
 * no text is empty, and both languages use the same placeholders and markup, so a
 * translation can never drop a value or a link.
 */
import { describe, expect, it } from 'vitest';
import { de } from './locales/de';
import { en } from './locales/en';

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [k, v] of leaves(value, path)) out.set(k, v);
  }
  return out;
}

const tokens = (text: string) =>
  [...text.matchAll(/\{\{\s*(\w+)\s*\}\}|<\/?(\d+)\s*\/?>/g)].map((m) => m[0]).sort();

describe('i18n catalogues', () => {
  const german = leaves(de as unknown as Tree);
  const english = leaves(en as unknown as Tree);

  it('have the same keys in German and English', () => {
    expect([...english.keys()].sort()).toEqual([...german.keys()].sort());
  });

  it('have no empty texts', () => {
    for (const [key, text] of [...german, ...english]) {
      expect(text.trim(), key).not.toBe('');
    }
  });

  it('use the same placeholders and markup in both languages', () => {
    for (const [key, text] of german) {
      expect(tokens(english.get(key)!), key).toEqual(tokens(text));
    }
  });
});
