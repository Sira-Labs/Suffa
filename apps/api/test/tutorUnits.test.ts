/**
 * al-Muʿallim building blocks (stories 10.1, 10.2, 10.4): the course catalog on the server,
 * the cache-friendly prompt, the tools with their input checks, and the answer validators.
 */
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { ContentCatalog, foldArabic, foldRoot } from '../src/tutor/content.js';
import type { LearnerSnapshot } from '../src/tutor/learner.js';
import { buildSystem } from '../src/tutor/prompt.js';
import { runTool, TUTOR_TOOLS, type MediaAccess } from '../src/tutor/tools.js';
import {
  BLOCKING,
  fallbackMessage,
  repairInstruction,
  tashkilCoverage,
  validateAnswer,
} from '../src/tutor/validate.js';

const CONTENT = fileURLToPath(new URL('../../web/src/content', import.meta.url));

const snapshot: LearnerSnapshot = {
  firstName: 'Amina',
  tutorLanguage: 'de',
  tashkilLevel: 'full',
  currentUnit: 2,
  enrolledUnits: [1, 2],
  cards: { total: 40, due: 5, leeches: 1 },
  troubleWords: [{ ar: 'أُسْرَة', de: 'Familie' }],
  lastExam: { units: [1], score: 18, total: 20, finishedAt: '2026-09-20T10:00:00.000Z' },
};

let catalog: ContentCatalog;
beforeAll(async () => {
  catalog = await ContentCatalog.load(CONTENT);
});

describe('ContentCatalog', () => {
  it('loads every unit of the app with its words', () => {
    expect(catalog.units.length).toBeGreaterThanOrEqual(16);
    expect(catalog.word('v-ism')).toMatchObject({ de: 'Name', einheit: 1 });
  });

  it('finds words by Arabic with or without vowels, by transliteration and by meaning', () => {
    expect(catalog.search('اسم')[0]?.id).toBe('v-ism');
    expect(catalog.search('اِسْم')[0]?.id).toBe('v-ism');
    expect(catalog.search('ism')[0]?.id).toBe('v-ism');
    expect(catalog.search('Name').map((w) => w.id)).toContain('v-ism');
    expect(catalog.search('   ')).toEqual([]);
    expect(catalog.search('zzzzqqq')).toEqual([]);
  });

  it('groups a root family in course order, however the root is written', () => {
    const a = catalog.rootFamily('س-م-و');
    expect(a.words.map((w) => w.id)).toContain('v-ism');
    expect(catalog.rootFamily('سمو').words).toEqual(a.words);
    expect(catalog.rootFamily('').words).toEqual([]);
    const units = a.words.map((w) => w.einheit);
    expect([...units].sort((x, y) => x - y)).toEqual(units);
  });

  it('builds the same curriculum pack bytes every time (prompt cache)', () => {
    const first = catalog.pack(2);
    expect(first).toContain('# Einheit 2');
    expect(first).toContain('## Wortschatz');
    expect(catalog.pack(2)).toBe(first);
    expect(catalog.pack(999)).toBe('');
  });

  it('folds Arabic spelling variants and roots', () => {
    expect(foldArabic('إِسْلامٌ')).toBe('اسلام');
    expect(foldArabic('مَدْرَسَةٌ')).toBe('مدرسه');
    expect(foldRoot('ك - ت - ب')).toBe('كتب');
  });
});

describe('buildSystem', () => {
  it('puts persona and unit pack first (cached) and the learner last', () => {
    const parts = buildSystem(catalog, snapshot, {});
    expect(parts.map((p) => Boolean(p.cache))).toEqual([true, true, false]);
    expect(parts[0]!.text).toContain('Explain in German');
    expect(parts[1]!.text).toBe(catalog.pack(2));
    expect(parts[2]!.text).toContain('Amina');
    expect(parts[2]!.text).toContain('أُسْرَة (Familie)');
    expect(parts[2]!.text).toContain('Vocalise every Arabic word fully.');
  });

  it('follows the asked unit, the tutoring language and a recording context', () => {
    const parts = buildSystem(
      catalog,
      {
        ...snapshot,
        tutorLanguage: 'en',
        tashkilLevel: 'none',
        firstName: null,
        lastExam: null,
      },
      { unit: 5, mediaId: '11111111-1111-4111-8111-111111111111', atSec: 754.4 }
    );
    expect(parts[0]!.text).toContain('Explain in English');
    expect(parts[1]!.text).toBe(catalog.pack(5));
    expect(parts[2]!.text).toContain('at 754 s');
    expect(parts[2]!.text).toContain('Name: not shared');
    expect(parts[2]!.text).toContain('without vowel marks');
    // An unknown unit falls back to the learner's own.
    expect(buildSystem(catalog, snapshot, { unit: 99 })[1]!.text).toBe(catalog.pack(2));
    // The persona is byte-identical between learners of one language.
    expect(buildSystem(catalog, { ...snapshot, firstName: 'Bilal' }, {})[0]!.text).toBe(
      buildSystem(catalog, snapshot, {})[0]!.text
    );
  });
});

describe('tutor tools', () => {
  const actor = { id: '00000000-0000-4000-8000-00000000000a', role: 'student' as const };
  const asked: string[] = [];
  const media: MediaAccess = {
    segment: async (_actor, mediaId) =>
      mediaId === '22222222-2222-4222-8222-222222222222'
        ? { title: 'Stunde 3', fromSec: 0, toSec: 90, text: '[12s] مَرْحَبًا' }
        : 'forbidden',
  };
  const ctx = () => ({
    actor,
    catalog,
    learner: {
      snapshot: async (id: string) => {
        asked.push(id);
        return snapshot;
      },
    },
    media,
  });
  const call = (name: string, input: unknown) =>
    runTool({ id: 't1', name, input }, ctx());

  it('declares strict schemas for every tool', () => {
    expect(TUTOR_TOOLS.map((t) => t.name)).toEqual([
      'lookup_vocab',
      'get_root_family',
      'get_learner_state',
      'get_media_segment',
    ]);
    for (const t of TUTOR_TOOLS) expect(t.inputSchema.additionalProperties).toBe(false);
  });

  it('looks up words and root families', async () => {
    const found = JSON.parse((await call('lookup_vocab', { query: 'اسم' })).content);
    expect(found[0]).toMatchObject({ ar: 'اسْم', de: 'Name', unit: 1 });
    expect(JSON.parse((await call('lookup_vocab', { query: 'qqqq' })).content)).toEqual({
      found: 0,
    });
    const family = JSON.parse((await call('get_root_family', { root: 'س-م-و' })).content);
    expect(family.words.length).toBeGreaterThan(0);
  });

  it('reads the state of the signed-in learner only, without their name', async () => {
    const result = await call('get_learner_state', { userId: 'someone-else' });
    expect(asked.at(-1)).toBe(actor.id);
    const state = JSON.parse(result.content);
    expect(state.firstName).toBeUndefined();
    expect(state.currentUnit).toBe(2);
  });

  it('answers a foreign and an unknown recording the same way', async () => {
    const ok = await call('get_media_segment', {
      mediaId: '22222222-2222-4222-8222-222222222222',
      atSec: 30,
    });
    expect(JSON.parse(ok.content).text).toContain('مَرْحَبًا');
    const foreign = await call('get_media_segment', {
      mediaId: '33333333-3333-4333-8333-333333333333',
      atSec: 30,
    });
    expect(foreign).toEqual({
      callId: 't1',
      content: 'no such recording for this learner',
      isError: true,
    });
    const off = await runTool(
      { id: 't2', name: 'get_media_segment', input: { mediaId: 'x', atSec: 1 } },
      { ...ctx(), media: null }
    );
    expect(off.isError).toBe(true);
  });

  it('turns invalid input and unknown tools into error results', async () => {
    for (const [name, input] of [
      ['lookup_vocab', null],
      ['lookup_vocab', { query: '' }],
      ['get_root_family', { root: 'x'.repeat(50) }],
      ['get_media_segment', { mediaId: 'not-a-uuid', atSec: 3 }],
      ['drop_tables', {}],
    ] as const) {
      expect((await call(name, input)).isError).toBe(true);
    }
  });
});

describe('validateAnswer', () => {
  it('accepts a vocalised answer in Arabic letters', () => {
    expect(validateAnswer('Richtig! هٰذا كِتابٌ – das ist ein Buch.', 'full')).toEqual(
      []
    );
    expect(validateAnswer('Gut gemacht, ganz ohne Arabisch.', 'full')).toEqual([]);
  });

  it('flags missing tashkīl only when the learner wants full vocalisation', () => {
    const bare = 'هذا كتاب جديد في البيت';
    expect(tashkilCoverage(bare)).toEqual({ words: 5, share: 0 });
    expect(validateAnswer(bare, 'full')).toEqual(['missing_tashkil']);
    expect(validateAnswer(bare, 'partial')).toEqual([]);
    expect(validateAnswer(bare, 'none')).toEqual([]);
    // Two bare particles in an otherwise German answer are fine.
    expect(validateAnswer('Das Wort في heißt „in“, من heißt „von“.', 'full')).toEqual([]);
  });

  it('flags Persian letters, rulings and empty answers', () => {
    expect(validateAnswer('کتاب', 'none')).toEqual(['foreign_letters']);
    expect(validateAnswer('Schweinefleisch ist haram.', 'none')).toEqual(['ruling']);
    expect(validateAnswer('That is not ḥalāl, sorry.', 'none')).toEqual(['ruling']);
    expect(validateAnswer('Ich gebe keine Fatwas, frag deinen Imam.', 'none')).toEqual(
      []
    );
    expect(validateAnswer('Das Wort حَلالٌ heißt „erlaubt“.', 'full')).toEqual([]);
    expect(validateAnswer('  ', 'full')).toEqual(['empty']);
  });

  it('writes a repair instruction and knows what blocks an answer', () => {
    const text = repairInstruction(['missing_tashkil', 'ruling'], 'en');
    expect(text).toContain('Vocalise every Arabic word fully.');
    expect(text).toContain('in English');
    expect(repairInstruction(['empty', 'foreign_letters'], 'de')).toContain('in German');
    expect(BLOCKING.has('missing_tashkil')).toBe(false);
    expect(BLOCKING.has('ruling')).toBe(true);
    expect(fallbackMessage('de')).toContain('Lehrkraft');
    expect(fallbackMessage('en')).toContain('teacher');
  });
});
