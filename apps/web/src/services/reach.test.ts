import { describe, expect, it } from 'vitest';
import { content, madinahVokabeln } from '@/content';
import { buildCardSeeds, resolveCard } from '@/services/srs';
import { inReachedUnits, introducibleRefs } from './reach';

describe('reach', () => {
  it('keeps items of reached units and items without a unit', () => {
    const keep = inReachedUnits([1, 2]);
    expect(keep({ einheit: 2 })).toBe(true);
    expect(keep({ einheit: 3 })).toBe(false);
    expect(keep({ einheit: undefined })).toBe(true);
  });

  it('lets new cards come only from reached units and own words', () => {
    const refs = introducibleRefs(content, [1], [{ id: 'own-1' }]);
    const unit1 = content.vokabeln.filter((v) => v.einheit === 1);
    const unit2 = content.vokabeln.filter((v) => v.einheit === 2);
    for (const v of unit1) expect(refs.has(v.id)).toBe(true);
    for (const v of unit2) expect(refs.has(v.id)).toBe(false);
    expect(refs.has('own-1')).toBe(true);
  });

  it('adds Medina words only once they were practised in their lesson', () => {
    const [first, second] = madinahVokabeln;
    const refs = introducibleRefs(content, [1], [], [first!.id]);
    expect(refs.has(first!.id)).toBe(true);
    expect(refs.has(second!.id)).toBe(false);
  });
});

describe('Medina words as review cards', () => {
  it('seeds recognition and recall cards for every Medina word', () => {
    const seeds = buildCardSeeds();
    for (const v of madinahVokabeln) {
      expect(seeds.some((s) => s.id === `vocab_ar_de:${v.id}`)).toBe(true);
      expect(seeds.some((s) => s.id === `vocab_de_ar:${v.id}`)).toBe(true);
    }
    // Ids are unique across both courses.
    const ids = [...content.vokabeln, ...madinahVokabeln].map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves a Medina card to its word and meaning', () => {
    const word = madinahVokabeln[0]!;
    expect(resolveCard('vocab_ar_de', word.id)).toMatchObject({
      prompt: word.ar,
      answer: word.de,
      speakable: word.ar,
      transliteration: undefined,
    });
    expect(resolveCard('vocab_de_ar', word.id)).toMatchObject({
      prompt: word.de,
      answer: word.ar,
    });
    expect(word.einheit).toBe(101);
  });
});
