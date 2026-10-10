import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  contentIds,
  contentOfFile,
  diffUnits,
  englishChanges,
  validateUnitContent,
  type UnitContent,
} from '../src/content/schema.js';
import {
  DEFAULT_SEED_DIR,
  loadSeedUnits,
  SeedError,
  seedContent,
} from '../src/content/seed.js';

const unit = (): UnitContent => ({
  titel: 'Test',
  vokabeln: [
    { id: 'v-a', ar: 'أ', tr: 'a', de: 'A', wurzel: '', plural: null, einheit: 1 },
    { id: 'v-b', ar: 'ب', tr: 'b', de: 'B', wurzel: 'ب-ب-ب', einheit: 1 },
  ],
  dialoge: [
    {
      id: 'd-1-1',
      einheit: 1,
      dialog: 1,
      titel: 'حوار',
      zeilen: [{ sp: 'أ', ar: 'مرحبا', de: 'Hallo' }],
    },
  ],
  grammatik: [
    {
      id: 'g-1-1',
      einheit: 1,
      abschnitt: 1,
      titel: 'Regel',
      regel: 'eine Regel',
      erklaerung: ['Erklärung'],
      beispiele: [{ ar: 'مثال', de: 'Beispiel' }],
      fragen: [
        { id: 'g-1-1#0', frage: 'F?', ar: null, antwort: 'x', ablenker: ['y', 'z'] },
      ],
    },
  ],
});

describe('content schema (story 16.1)', () => {
  it('accepts every unit file the web app bundles (the seed)', async () => {
    const units = await loadSeedUnits(DEFAULT_SEED_DIR);
    expect(units.length).toBeGreaterThanOrEqual(16);
    expect(units.map((u) => u.file.einheit)).toEqual(units.map((_, i) => i + 1));
    // IDs are unique across all units, as SRS cards rely on.
    const ids = units.flatMap((u) => contentIds(contentOfFile(u.file)).map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('accepts a well-formed unit', () => {
    expect(validateUnitContent(1, unit())).toEqual({ ok: true, content: unit() });
  });

  it('rejects broken shapes with a path', () => {
    const result = validateUnitContent(1, { ...unit(), vokabeln: [{ id: 'v-x' }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]).toMatch(/^vokabeln\.0\./);
    expect(validateUnitContent(1, { ...unit(), extra: 1 }).ok).toBe(false);
    expect(validateUnitContent(1, null).ok).toBe(false);
    const badId = unit();
    badId.vokabeln[0]!.id = 'v a';
    expect(validateUnitContent(1, badId).ok).toBe(false);
  });

  it('checks the rules across fields', () => {
    const issues = (content: UnitContent) => {
      const result = validateUnitContent(1, content);
      return result.ok ? [] : result.issues;
    };
    const wrongUnit = unit();
    wrongUnit.vokabeln[1]!.einheit = 2;
    expect(issues(wrongUnit)).toEqual(['vokabeln.1.einheit: must be 1']);

    const duplicate = unit();
    duplicate.vokabeln[1]!.id = 'v-a';
    expect(issues(duplicate)).toEqual(['duplicate id v-a']);

    const twoFirst = unit();
    twoFirst.dialoge.push({ ...twoFirst.dialoge[0]!, id: 'd-1-2' });
    expect(issues(twoFirst)).toEqual(['dialoge.1.dialog: 1 twice']);

    const section = unit();
    section.grammatik[0]!.abschnitt = 2;
    expect(issues(section)).toEqual(['grammatik.0.abschnitt: unit has 1 dialogues']);

    const question = unit();
    question.grammatik[0]!.fragen[0]!.id = 'g-9#0';
    question.grammatik[0]!.fragen[0]!.ablenker = ['x'];
    expect(issues(question)).toEqual([
      'grammatik.0.fragen.0.id: must start with g-1-1#',
      'grammatik.0.fragen.0.ablenker: contains the answer',
    ]);
  });

  it('lists what a draft changes against the published unit', () => {
    const before = unit();
    const after = unit();
    after.vokabeln[0]!.de = 'A (neu)';
    after.vokabeln.splice(1, 1);
    after.vokabeln.push({ id: 'v-c', ar: 'ج', tr: 'c', de: 'C', wurzel: '', einheit: 1 });
    // A changed quiz question is a change of its grammar point.
    after.grammatik[0]!.fragen[0]!.frage = 'Neu?';
    expect(diffUnits(before, after)).toEqual({
      added: ['v-c'],
      removed: ['v-b'],
      changed: ['v-a', 'g-1-1'],
      textChanged: false,
      english: [],
    });
    // Key order is no change.
    const reordered = unit();
    const [first] = reordered.vokabeln;
    reordered.vokabeln[0] = Object.fromEntries(
      Object.entries(first!).reverse()
    ) as typeof first & object;
    expect(diffUnits(before, reordered).changed).toEqual([]);
    expect(diffUnits(before, { ...before, kulturnotiz: 'Neu' }).textChanged).toBe(true);
    expect(diffUnits(null, before)).toMatchObject({
      added: ['v-a', 'v-b', 'd-1-1', 'g-1-1'],
    });
  });

  it('names the broken seed file instead of seeding half', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'suffa-seed-'));
    await writeFile(join(dir, 'einheit-01.json'), '{ broken');
    await expect(loadSeedUnits(dir)).rejects.toThrow(SeedError);
    await expect(loadSeedUnits(dir)).rejects.toThrow(/einheit-01\.json/);

    await writeFile(
      join(dir, 'einheit-01.json'),
      JSON.stringify({ einheit: 1, ...unit() })
    );
    await writeFile(join(dir, 'notes.json'), '{}');
    expect((await loadSeedUnits(dir)).map((u) => u.file.einheit)).toEqual([1]);

    const wrong = { einheit: 2, ...unit() };
    await writeFile(join(dir, 'einheit-02.json'), JSON.stringify(wrong));
    await expect(loadSeedUnits(dir)).rejects.toThrow(/einheit-02\.json: vokabeln\.0/);
  });

  it('logs an unreadable seed and keeps the API running', async () => {
    const errors: string[] = [];
    const log = { info: () => {}, error: (_: object, msg: string) => errors.push(msg) };
    let bundles = 0;
    const repo = {
      seed: async () => ({ inserted: 1, refreshed: 0 }),
      ensureBundle: async () => {
        bundles += 1;
        return null;
      },
    } as unknown as Parameters<typeof seedContent>[0];
    expect(await seedContent(repo, join(tmpdir(), 'suffa-no-such-dir'), log)).toBe(0);
    const dir = await mkdtemp(join(tmpdir(), 'suffa-seed-'));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'einheit-01.json'), '[]');
    expect(await seedContent(repo, dir, log)).toBe(0);
    expect(errors).toEqual(['content.seed_unreadable', 'content.seed_unreadable']);
    // The published units still get their bundle.
    expect(bundles).toBe(2);
  });

  it('accepts English beside German and lists where it is new or changed (16.4)', () => {
    const before = unit();
    const after = unit();
    after.vokabeln[0]!.en = 'A in English';
    after.dialoge[0]!.zeilen[0]!.en = 'Hello';
    expect(validateUnitContent(1, after).ok).toBe(true);
    expect(englishChanges(before, after)).toEqual([
      after.vokabeln[0]!.id,
      `${after.dialoge[0]!.id}#0`,
    ]);
    // The same English again is no change; an empty one is no English.
    expect(englishChanges(after, structuredClone(after))).toEqual([]);
    expect(
      validateUnitContent(1, { ...after, vokabeln: [{ ...after.vokabeln[0]!, en: '' }] })
        .ok
    ).toBe(false);
  });
});
