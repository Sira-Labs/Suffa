/**
 * Words for Muslims in Europe (story 18.4, ADR-0034): suggested by the LLM, decided one by
 * one, and part of a unit only once a reviewer accepted them.
 */
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthResolver } from '../src/auth/resolver.js';
import { PgContentRepository, type UnitDetail } from '../src/content/repository.js';
import { DEFAULT_SEED_DIR, seedContent } from '../src/content/seed.js';
import { PgWordSuggestionRepository } from '../src/content/wordSuggestions.js';
import { loadMigrations, migrate } from '../src/migrate.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };
const ADMIN = '00000000-0000-4000-8000-0000000000e1';
const TEACHER = '00000000-0000-4000-8000-0000000000e2';
const STUDENT = '00000000-0000-4000-8000-0000000000e3';
const UNIT = '/api/v1/content/units/bayna-yadayk/1';

interface Suggested {
  id: string;
  ar: string;
  tr: string;
  de: string;
  status: string;
  own: boolean;
  wordId: string | null;
  reason: string | null;
}

// Words the course does not have (the fast-breaking meal and the meal before dawn).
const iftar = {
  ar: 'إِفْطار',
  tr: 'ifṭār',
  de: 'Fastenbrechen',
  wurzel: 'ف-ط-ر',
  plural: null,
  reason: 'Dazu lädt man sich im Ramadan ein.',
};
const suhur = {
  ar: 'سَحُور',
  tr: 'saḥūr',
  de: 'Mahlzeit vor der Morgendämmerung',
  wurzel: 'س-ح-ر',
  plural: null,
  reason: 'Gehört zum Fastentag.',
};

describe.skipIf(!url)('Word suggestions (Postgres)', () => {
  let pool: pg.Pool;
  let app: ReturnType<typeof createApp>;
  let suggestions: PgWordSuggestionRepository;
  /** Runs while the fake model is answering, once. */
  let whileAnswering: (() => Promise<void>) | null = null;
  /** What the fake model answers; changed by the tests. */
  let answer: unknown[] = [];
  /** Answers for the next calls, one each, before `answer` is used again. */
  const nextAnswers: unknown[][] = [];
  const asked: { unit: number; courseWords: string[]; words: unknown[] }[] = [];

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    await pool.query('drop schema public cascade; create schema public');
    await migrate(
      pool,
      await loadMigrations(join(import.meta.dirname, '..', 'migrations')),
      quiet
    );
    await pool.query(
      `insert into users (id, email, name, role) values
         ($1, 'chef@example.org', 'Chef', 'admin'),
         ($2, 'lehrerin@example.org', 'Lehrerin', 'teacher'),
         ($3, 'amina@example.org', 'Amina', 'student')`,
      [ADMIN, TEACHER, STUDENT]
    );
    const auth: AuthResolver = {
      actor: async (h) => {
        const who = h.get('x-test-user');
        if (who === 'admin') return { id: ADMIN, role: 'admin', secondFactor: true };
        if (who === 'teacher') return { id: TEACHER, role: 'teacher' };
        if (who === 'student') return { id: STUDENT, role: 'student' };
        return null;
      },
    };
    const content = new PgContentRepository(pool);
    await seedContent(content, DEFAULT_SEED_DIR, quiet);
    const gateway = {
      complete: async (
        _actor: unknown,
        task: string,
        input: { messages: { content: string }[] }
      ) => {
        expect(task).toBe('content.author-assist');
        asked.push(JSON.parse(input.messages[0]!.content) as (typeof asked)[number]);
        const words = nextAnswers.shift() ?? answer;
        // The answer comes a moment later, as from a model: calls made together overlap.
        await new Promise((resolve) => setTimeout(resolve, 20));
        const meanwhile = whileAnswering;
        whileAnswering = null;
        await meanwhile?.();
        return { text: JSON.stringify({ words }), model: 'fake-model' };
      },
    };
    suggestions = new PgWordSuggestionRepository(pool, content);
    app = createApp({
      version: 'test',
      expectedRevision: null,
      health: {
        schemaRevision: async () => null,
        queueDepth: async () => ({ waiting: 0, active: 0, failed: 0, deadLetter: 0 }),
      },
      content: { repo: content, auth, log: quiet },
      wordSuggestions: {
        content,
        suggestions,
        gateway: gateway as never,
        auth,
        log: quiet,
      },
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    answer = [iftar, suhur];
    nextAnswers.length = 0;
    whileAnswering = null;
    asked.length = 0;
    await pool.query('truncate content_word_suggestions');
    // Ids are never given twice: each test starts as if no suggested word ever had one.
    await pool.query(`delete from content_ids where id ~ '^v-(iftar|sahur)'`);
    await pool.query(`delete from audit_log where action like 'content.word%'`);
  });

  const call = (method: string, path: string, user?: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: {
        ...(user ? { 'x-test-user': user } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  /** The newest bundle as learners download it; fails when there is none. */
  const bundleNow = async () => {
    const manifest = await call('GET', '/api/v1/content/manifest');
    expect(manifest.status).toBe(200);
    const bundle = await call('GET', ((await manifest.json()) as { url: string }).url);
    expect(bundle.status).toBe(200);
    const text = await bundle.text();
    // A bundle with the course in it: "not in it" below means something.
    expect(text).toContain('v-ism');
    return text;
  };
  const order = (user = 'admin') => call('POST', `${UNIT}/word-suggestions/draft`, user);
  const list = async (user = 'teacher'): Promise<Suggested[]> =>
    (
      (await (await call('GET', `${UNIT}/word-suggestions`, user)).json()) as {
        suggestions: Suggested[];
      }
    ).suggestions;
  const decide = (id: string, user: string, body: unknown) =>
    call('POST', `/api/v1/content/word-suggestions/${id}/decide`, user, body);
  const unitNow = async () =>
    (await (await call('GET', UNIT, 'teacher')).json()) as UnitDetail;
  /** Takes a word out of the unit again, so that tests do not build on each other. */
  const removeWord = async (id: string) => {
    const unit = await unitNow();
    const res = await call('PUT', `${UNIT}/draft`, 'admin', {
      revision: unit.revision,
      content: {
        ...unit.draft,
        vokabeln: unit.draft.vokabeln.filter((w) => w.id !== id),
      },
    });
    expect(res.status).toBe(200);
  };

  it('stores what the model suggests for review, and only what is a new word', async () => {
    const known = (await unitNow()).draft.vokabeln[0]!;
    answer = [
      iftar,
      // The course has it already, here with the article.
      { ...iftar, ar: `ال${known.ar}`, tr: 'x', de: 'schon da' },
      // The same word twice, a word that is not Arabic, and one without German.
      { ...iftar, ar: 'الإِفْطارُ', de: 'das Fastenbrechen' },
      { ...suhur, ar: 'sahur' },
      { ...suhur, de: '   ' },
      suhur,
    ];
    expect((await order('teacher')).status).toBe(403);
    expect((await order('student')).status).toBe(403);
    expect(asked).toHaveLength(0);

    const res = await order();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggested: 2 });
    // The model saw the unit and what the course has.
    expect(asked[0]!.unit).toBe(1);
    expect(asked[0]!.words.length).toBeGreaterThan(10);
    expect(asked[0]!.courseWords.length).toBeGreaterThan(300);

    const stored = await list();
    expect(stored.map((s) => [s.ar, s.de, s.status, s.own, s.wordId])).toEqual([
      ['إِفْطار', 'Fastenbrechen', 'suggested', false, null],
      ['سَحُور', 'Mahlzeit vor der Morgendämmerung', 'suggested', false, null],
    ]);
    expect(stored[0]!.reason).toBe(iftar.reason);
    expect((await list('admin')).every((s) => s.own)).toBe(true);
    expect((await call('GET', `${UNIT}/word-suggestions`, 'student')).status).toBe(403);
    expect((await call('GET', `${UNIT}/word-suggestions`)).status).toBe(401);

    // Nothing of it is in the unit or in what learners download.
    expect(JSON.stringify(await unitNow())).not.toContain('إِفْطار');
    expect(await bundleNow()).not.toContain('إِفْطار');

    // Asked again, the model is told what was suggested, and the same words are not new.
    const again = await order();
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: 'nothing_new' });
    expect(asked[1]!.courseWords).toContain('اِفطار');
  });

  it('writes an accepted word into the unit’s draft, as the reviewer corrected it', async () => {
    await order();
    const [first, second] = await list();
    const before = await unitNow();

    // Whoever ordered the suggestions does not decide on them, though they may review.
    const own = await decide(first!.id, 'admin', { decision: 'accepted' });
    expect([own.status, await own.json()]).toEqual([403, { error: 'own_suggestion' }]);
    const rejectOwn = await decide(first!.id, 'admin', { decision: 'rejected' });
    expect(await rejectOwn.json()).toEqual({ error: 'own_suggestion' });
    expect((await decide(first!.id, 'student', { decision: 'accepted' })).status).toBe(
      403
    );
    // A correction must still be an Arabic word of the unit's shape.
    const latin = await decide(first!.id, 'teacher', {
      decision: 'accepted',
      word: { ar: 'iftarس' },
    });
    expect([latin.status, ((await latin.json()) as { error: string }).error]).toEqual([
      400,
      'invalid_word',
    ]);
    expect(
      (await decide(first!.id, 'teacher', { decision: 'accepted', word: { ar: '' } }))
        .status
    ).toBe(400);
    // A NUL is a fault of the field, not an error of the database.
    const nul = await decide(first!.id, 'teacher', {
      decision: 'accepted',
      word: { de: 'Fasten\u0000brechen' },
    });
    expect([nul.status, await nul.json()]).toEqual([
      400,
      { error: 'invalid_word', issues: ['de: must not contain a NUL character'] },
    ]);
    expect(
      (await decide(first!.id, 'teacher', { decision: 'accepted', word: { id: 'x' } }))
        .status
    ).toBe(400);
    expect((await unitNow()).revision).toBe(before.revision);

    try {
      const res = await decide(first!.id, 'teacher', {
        decision: 'accepted',
        word: { de: 'Fastenbrechen, Iftar' },
      });
      expect(res.status).toBe(200);
      const { suggestion } = (await res.json()) as { suggestion: Suggested };
      expect(suggestion).toMatchObject({
        status: 'accepted',
        wordId: 'v-iftar',
        de: 'Fastenbrechen, Iftar',
      });
      const after = await unitNow();
      expect(after.revision).toBe(before.revision + 1);
      expect(after.state).toBe('draft');
      expect(after.draft.vokabeln.at(-1)).toEqual({
        id: 'v-iftar',
        ar: 'إِفْطار',
        tr: 'ifṭār',
        de: 'Fastenbrechen, Iftar',
        wurzel: 'ف-ط-ر',
        plural: null,
        einheit: 1,
      });
      // Learners get it only when the unit is published.
      expect(await bundleNow()).not.toContain('v-iftar');

      // Decided is decided, and the other suggestion is untouched.
      expect((await decide(first!.id, 'teacher', { decision: 'rejected' })).status).toBe(
        409
      );
      expect((await list()).find((s) => s.id === second!.id)!.status).toBe('suggested');

      const audit = await pool.query<{ actor_id: string; details: object }>(
        `select actor_id, details from audit_log
          where action = 'content.word_suggestion_decided'`
      );
      expect(audit.rows).toEqual([
        {
          actor_id: TEACHER,
          details: {
            unitId: 'bayna-yadayk/1',
            decision: 'accepted',
            wordId: 'v-iftar',
            ar: 'إِفْطار',
            de: 'Fastenbrechen, Iftar',
            corrected: true,
          },
        },
      ]);
      // Taken out of the unit and accepted again later, the word gets a new id: review
      // cards made for the first one must never show another word.
      await removeWord('v-iftar');
      await pool.query('truncate content_word_suggestions');
      answer = [iftar];
      await order();
      const [again] = await list();
      const later = await decide(again!.id, 'teacher', { decision: 'accepted' });
      expect(((await later.json()) as { suggestion: Suggested }).suggestion.wordId).toBe(
        'v-iftar-2'
      );
    } finally {
      await removeWord('v-iftar');
      await removeWord('v-iftar-2');
    }
  });

  it('leaves the unit alone when a suggestion is rejected, and does not suggest it again', async () => {
    await order();
    const [first] = await list();
    const before = await unitNow();
    const res = await decide(first!.id, 'teacher', { decision: 'rejected' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { suggestion: Suggested }).suggestion.status).toBe(
      'rejected'
    );
    expect((await unitNow()).revision).toBe(before.revision);

    answer = [iftar];
    expect((await order()).status).toBe(409);
    expect((await list()).filter((s) => s.ar === iftar.ar)).toHaveLength(1);
  });

  it('refuses a word another unit got in the meantime, and gives each word an id of its own', async () => {
    await order();
    const [first, second] = await list();
    // An editor adds the first word to unit 2 by hand, under the id the second would get.
    const OTHER = '/api/v1/content/units/bayna-yadayk/2';
    const other = (await (await call('GET', OTHER, 'teacher')).json()) as UnitDetail;
    const byHand = {
      id: 'v-sahur',
      ar: 'الإِفْطار',
      tr: 'al-ifṭār',
      de: 'das Fastenbrechen',
      wurzel: 'ف-ط-ر',
      einheit: 2,
    };
    const saved = await call('PUT', `${OTHER}/draft`, 'admin', {
      revision: other.revision,
      content: { ...other.draft, vokabeln: [...other.draft.vokabeln, byHand] },
    });
    expect(saved.status).toBe(200);
    try {
      const refused = await decide(first!.id, 'teacher', { decision: 'accepted' });
      expect(refused.status).toBe(409);
      expect(await refused.json()).toEqual({ error: 'duplicate_word' });
      expect((await list()).find((s) => s.id === first!.id)!.status).toBe('suggested');

      // "saḥūr" would be v-sahur, which the word in unit 2 has.
      const res = await decide(second!.id, 'teacher', { decision: 'accepted' });
      expect(res.status).toBe(200);
      expect(((await res.json()) as { suggestion: Suggested }).suggestion.wordId).toBe(
        'v-sahur-2'
      );
      expect((await unitNow()).draft.vokabeln.map((w) => w.id)).toContain('v-sahur-2');
    } finally {
      await removeWord('v-sahur-2');
      const now = (await (await call('GET', OTHER, 'teacher')).json()) as UnitDetail;
      const res = await call('PUT', `${OTHER}/draft`, 'admin', {
        revision: now.revision,
        content: {
          ...now.draft,
          vokabeln: now.draft.vokabeln.filter((w) => w.id !== 'v-sahur'),
        },
      });
      expect(res.status).toBe(200);
    }
  });

  it('records the decision when the word is in the unit already', async () => {
    await order();
    const [first] = await list();
    // As after an accept whose decision was not stored: the word is there, the
    // suggestion still open.
    const unit = await unitNow();
    const saved = await call('PUT', `${UNIT}/draft`, 'admin', {
      revision: unit.revision,
      content: {
        ...unit.draft,
        vokabeln: [
          ...unit.draft.vokabeln,
          { id: 'v-iftar', ...iftar, reason: undefined, de: 'Iftar', einheit: 1 },
        ],
      },
    });
    expect(saved.status).toBe(200);
    try {
      const res = await decide(first!.id, 'teacher', {
        decision: 'accepted',
        word: { de: 'etwas anderes' },
      });
      expect(res.status).toBe(200);
      expect(((await res.json()) as { suggestion: Suggested }).suggestion).toMatchObject({
        status: 'accepted',
        wordId: 'v-iftar',
        de: 'Iftar',
      });
      const now = await unitNow();
      expect(now.revision).toBe(unit.revision + 1);
      expect(now.draft.vokabeln.filter((w) => w.id.startsWith('v-iftar'))).toHaveLength(
        1
      );
    } finally {
      await removeWord('v-iftar');
    }
  });

  it('takes many decisions at once without waiting on itself, and each word once', async () => {
    answer = Array.from({ length: 12 }, (_, i) => ({
      ...iftar,
      ar: `${iftar.ar}${'ة'.repeat(i + 1)}`,
      tr: `iftar ${i}`,
    }));
    expect(await (await order()).json()).toEqual({ suggested: 12 });
    // More requests than the pool has connections, twice for each suggestion.
    const all = await list();
    const results = await Promise.all(
      [...all, ...all].map((s) => decide(s.id, 'teacher', { decision: 'accepted' }))
    );
    const statuses = results.map((r) => r.status);
    expect(statuses.every((code) => code === 200 || code === 409)).toBe(true);
    expect(statuses).toContain(200);
    try {
      const added = (await unitNow()).draft.vokabeln.filter((w) =>
        w.tr.startsWith('iftar ')
      );
      const accepted = (await list()).filter((s) => s.status === 'accepted');
      // Every word that got into the unit is there once.
      expect(new Set(added.map((w) => w.ar)).size).toBe(added.length);
      for (const s of accepted) expect(added.map((w) => w.id)).toContain(s.wordId);
      // Whoever lost to another save decides again and gets through.
      for (const open of (await list()).filter((s) => s.status === 'suggested')) {
        expect((await decide(open.id, 'teacher', { decision: 'accepted' })).status).toBe(
          200
        );
      }
      expect((await list()).every((s) => s.status === 'accepted')).toBe(true);
      const words = (await unitNow()).draft.vokabeln.filter((w) =>
        w.tr.startsWith('iftar ')
      );
      expect(words).toHaveLength(12);
      expect(new Set(words.map((w) => w.id)).size).toBe(12);

      // With twelve undecided suggestions the model is not asked for more.
      await pool.query(`update content_word_suggestions set status = 'suggested'`);
      const calls = asked.length;
      const more = await order();
      expect([more.status, await more.json()]).toEqual([409, { error: 'decide_first' }]);
      expect(asked).toHaveLength(calls);
    } finally {
      const now = await unitNow();
      const res = await call('PUT', `${UNIT}/draft`, 'admin', {
        revision: now.revision,
        content: {
          ...now.draft,
          vokabeln: now.draft.vokabeln.filter((w) => !w.tr.startsWith('iftar ')),
        },
      });
      expect(res.status).toBe(200);
    }
  });

  it('never leaves a rejected suggestion with its word in the unit', async () => {
    // Accept and reject arrive together, many times over: whichever wins, the unit and
    // the suggestion agree.
    for (let round = 0; round < 6; round++) {
      await pool.query('truncate content_word_suggestions');
      await pool.query(`delete from content_ids where id ~ '^v-(iftar|sahur)'`);
      answer = [iftar];
      await order();
      const [only] = await list();
      const [accept, reject] = await Promise.all([
        decide(only!.id, 'teacher', { decision: 'accepted' }),
        decide(only!.id, 'teacher', { decision: 'rejected' }),
      ]);
      try {
        expect([accept.status, reject.status].sort()).toEqual([200, 409]);
        const status = (await list())[0]!.status;
        const inUnit = (await unitNow()).draft.vokabeln.some((w) => w.id === 'v-iftar');
        expect(status).toBe(accept.status === 200 ? 'accepted' : 'rejected');
        expect(inUnit).toBe(status === 'accepted');
      } finally {
        await removeWord('v-iftar');
      }
    }
  });

  it('keeps a unit at twelve open suggestions when two runs answer together', async () => {
    const words = (prefix: string) =>
      Array.from({ length: 12 }, (_, i) => ({
        ...iftar,
        ar: `${prefix}${'ة'.repeat(i + 1)}`,
        // A NUL in what the model wrote must not cost the whole batch.
        reason: `Grund\u0000 ${i}`,
      }));
    nextAnswers.push(words('إِفْطار'), words('سَحُور'));
    const [a, b] = await Promise.all([order(), order()]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const stored = await list();
    expect(stored).toHaveLength(12);
    expect(stored.every((s) => s.reason?.startsWith('Grund ') === true)).toBe(true);
    const counts = [
      ((await a.json()) as { suggested: number }).suggested,
      ((await b.json()) as { suggested: number }).suggested,
    ];
    expect(counts.reduce((sum, n) => sum + n, 0)).toBe(12);
  });

  it('gives a new id to one unit only when two units are saved with it together', async () => {
    const OTHER = '/api/v1/content/units/bayna-yadayk/2';
    const save = async (path: string, einheit: number) => {
      const unit = (await (await call('GET', path, 'teacher')).json()) as UnitDetail;
      return call('PUT', `${path}/draft`, 'admin', {
        revision: unit.revision,
        content: {
          ...unit.draft,
          vokabeln: [
            ...unit.draft.vokabeln,
            { id: 'v-sahur', ...suhur, reason: undefined, einheit },
          ],
        },
      });
    };
    const results = await Promise.all([save(UNIT, 1), save(OTHER, 2)]);
    try {
      expect(results.map((r) => r.status).sort()).toEqual([200, 422]);
      const refused = results.find((r) => r.status === 422)!;
      expect(((await refused.json()) as { error: string }).error).toBe('id_taken');
      const owners = await pool.query(
        `select unit_id from content_ids where id = 'v-sahur'`
      );
      expect(owners.rows).toHaveLength(1);
      const has = async (path: string) =>
        (
          (await (await call('GET', path, 'teacher')).json()) as UnitDetail
        ).draft.vokabeln.some((w) => w.id === 'v-sahur');
      expect([await has(UNIT), await has(OTHER)].filter(Boolean)).toHaveLength(1);
    } finally {
      for (const path of [UNIT, OTHER]) {
        const unit = (await (await call('GET', path, 'teacher')).json()) as UnitDetail;
        const res = await call('PUT', `${path}/draft`, 'admin', {
          revision: unit.revision,
          content: {
            ...unit.draft,
            vokabeln: unit.draft.vokabeln.filter((w) => w.id !== 'v-sahur'),
          },
        });
        expect(res.status).toBe(200);
      }
    }
  });

  it('refuses a plan made from a draft that a changed seed file replaced', async () => {
    await order();
    const [first] = await list();
    const unit = await unitNow();
    const word = {
      id: 'v-iftar',
      ar: iftar.ar,
      tr: iftar.tr,
      de: iftar.de,
      wurzel: iftar.wurzel,
      plural: null,
      einheit: 1,
    };
    const plan = { unitId: unit.id, revision: unit.revision, draft: unit.draft, word };
    const reviewer = { id: TEACHER, ipAddress: null };
    // As a changed seed file does it for an untouched unit: another draft, the same revision.
    await pool.query(
      `update content_units set draft = jsonb_set(draft, '{titel}', '"Neu"') where id = $1`,
      [unit.id]
    );
    try {
      const append = await suggestions.accept(first!.id, reviewer, {
        ...plan,
        content: { ...unit.draft, vokabeln: [...unit.draft.vokabeln, word] },
      });
      expect(append).toEqual({ ok: false, reason: 'unit_changed' });
      const there = await suggestions.accept(first!.id, reviewer, {
        ...plan,
        content: null,
      });
      expect(there).toEqual({ ok: false, reason: 'unit_changed' });
      const now = await unitNow();
      expect(now.revision).toBe(unit.revision);
      expect(now.draft.titel).toBe('Neu');
      expect(now.draft.vokabeln).toEqual(unit.draft.vokabeln);
      expect((await list())[0]!.status).toBe('suggested');
    } finally {
      await pool.query(`update content_units set draft = $2::jsonb where id = $1`, [
        unit.id,
        JSON.stringify(unit.draft),
      ]);
    }
    // The same plan on the draft it was made from goes through.
    const again = await suggestions.accept(first!.id, reviewer, {
      ...plan,
      content: null,
    });
    expect(again.ok).toBe(true);
  });

  it('does not store a word an editor added to the course while the model answered', async () => {
    const other = await pool.query<{ id: string; draft: UnitDetail['draft'] }>(
      `select id, draft from content_units where id = 'bayna-yadayk/2'`
    );
    const { id, draft } = other.rows[0]!;
    whileAnswering = async () => {
      await pool.query(`update content_units set draft = $2::jsonb where id = $1`, [
        id,
        JSON.stringify({
          ...draft,
          vokabeln: [
            ...draft.vokabeln,
            { id: 'v-sahur', ...suhur, reason: undefined, einheit: 2 },
          ],
        }),
      ]);
    };
    try {
      const res = await order();
      expect(res.status).toBe(200);
      expect((await list()).map((s) => s.ar)).toEqual([iftar.ar]);
    } finally {
      await pool.query(`update content_units set draft = $2::jsonb where id = $1`, [
        id,
        JSON.stringify(draft),
      ]);
    }
  });

  it('says so when the model answers nothing usable', async () => {
    answer = [];
    const empty = await order();
    expect(empty.status).toBe(502);
    expect(await empty.json()).toEqual({ error: 'ai_failed' });
    answer = [{ ar: 'x' }];
    expect((await order()).status).toBe(502);
    expect(await list()).toEqual([]);
    expect(
      (
        await call(
          'POST',
          '/api/v1/content/units/bayna-yadayk/99/word-suggestions/draft',
          'admin'
        )
      ).status
    ).toBe(404);
  });
});
