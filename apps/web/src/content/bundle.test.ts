/**
 * The content loader on the next start after a bundle was downloaded (story 16.2): the
 * bundle's units replace the built-in ones, removed words are no new cards but still resolve
 * for existing SRS cards, and a broken store falls back to the built-in units.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUNDLE_STORAGE_KEY, type ContentBundle } from './bundle';

async function freshContent() {
  vi.resetModules();
  const content = await import('@/content');
  const { resolveCard } = await import('@/services/srs/resolve');
  return { ...content, resolveCard };
}

describe('content loader with a stored bundle', () => {
  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('uses the bundled unit files without a stored bundle', async () => {
    const { CONTENT_BUNDLE_VERSION, unitInfos, retiredVokabeln } = await freshContent();
    expect(CONTENT_BUNDLE_VERSION).toBe(0);
    expect(unitInfos.length).toBeGreaterThanOrEqual(16);
    expect(retiredVokabeln).toEqual([]);
  });

  it('takes units and tombstones from the stored bundle', async () => {
    const builtIn = await freshContent();
    const unit1 = builtIn.content.vokabeln.filter((v) => v.einheit === 1);
    const [removed, ...kept] = unit1;
    const stored: ContentBundle = {
      format: 1,
      version: 7,
      createdAt: '2026-10-10T00:00:00.000Z',
      course: 'bayna-yadayk',
      units: [
        {
          einheit: 1,
          titel: 'Aus dem CMS',
          status: 'geprueft',
          vokabeln: kept,
          dialoge: builtIn.content.dialoge.filter((d) => d.einheit === 1),
          grammatik: builtIn.content.grammatik.filter((g) => g.einheit === 1),
        },
      ],
      tombstones: [{ id: removed!.id, kind: 'vocab', unit: 1, item: removed }],
    };
    localStorage.setItem(BUNDLE_STORAGE_KEY, JSON.stringify(stored));

    const next = await freshContent();
    expect(next.CONTENT_BUNDLE_VERSION).toBe(7);
    expect(next.unitInfos[0]).toMatchObject({
      einheit: 1,
      titel: 'Aus dem CMS',
      status: 'geprueft',
    });
    // Other units still come from the app.
    expect(next.unitInfos.length).toBe(builtIn.unitInfos.length);
    // The removed word is no longer content …
    expect(next.content.vokabeln.some((v) => v.id === removed!.id)).toBe(false);
    // … but an SRS card made before still shows it.
    expect(next.resolveCard('vocab_ar_de', removed!.id)).toMatchObject({
      prompt: removed!.ar,
      answer: removed!.de,
    });
  });

  it('falls back to the bundled unit files when the store is broken', async () => {
    localStorage.setItem(BUNDLE_STORAGE_KEY, '{ not json');
    const { CONTENT_BUNDLE_VERSION, unitInfos } = await freshContent();
    expect(CONTENT_BUNDLE_VERSION).toBe(0);
    expect(unitInfos.length).toBeGreaterThanOrEqual(16);
  });
});
