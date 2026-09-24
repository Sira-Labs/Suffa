import { describe, expect, it } from 'vitest';
import { content, unitInfos } from '@/content';
import { AMR_LABELS, PERSON_LABELS } from '@/types';

const ARABIC = /^[؀-ۿݐ-ݿ]+$/;

/** Guards the verb tables: complete, Arabic only, unique and tied to an existing unit. */
describe('verb tables', () => {
  it('has a complete, Arabic-only table for every verb', () => {
    const persons = Object.keys(PERSON_LABELS);
    const imperative = Object.keys(AMR_LABELS);
    for (const verb of content.verben) {
      for (const table of [verb.madi, verb.mudari]) {
        expect(Object.keys(table).sort()).toEqual([...persons].sort());
        for (const form of Object.values(table)) expect(form).toMatch(ARABIC);
      }
      expect(Object.keys(verb.amr).sort()).toEqual([...imperative].sort());
      for (const form of Object.values(verb.amr)) expect(form).toMatch(ARABIC);
      expect(verb.madi.huwa).toBe(verb.lemma);
    }
  });

  it('gives every verb a unique id and a unit that exists', () => {
    const ids = content.verben.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    const units = new Set(unitInfos.map((u) => u.einheit));
    for (const verb of content.verben) expect(units.has(verb.einheit!)).toBe(true);
  });
});
