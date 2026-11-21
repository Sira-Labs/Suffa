/**
 * Meanings in further languages (story 18.4, ADR-0031): drafted by the LLM, reviewed one by
 * one, and never part of what learners get.
 */
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthResolver } from '../src/auth/resolver.js';
import {
  MAX_MEANING_LENGTH,
  PgMeaningDraftRepository,
} from '../src/content/meaningDrafts.js';
import { PgContentRepository, type UnitDetail } from '../src/content/repository.js';
import { DEFAULT_SEED_DIR, seedContent } from '../src/content/seed.js';
import { loadMigrations, migrate } from '../src/migrate.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };
const ADMIN = '00000000-0000-4000-8000-0000000000d1';
const TEACHER = '00000000-0000-4000-8000-0000000000d2';
const STUDENT = '00000000-0000-4000-8000-0000000000d3';
const UNIT = '/api/v1/content/units/bayna-yadayk/1';

interface WordRow {
  wordId: string;
  de: string;
  draft: { id: string; text: string; status: string; stale: boolean } | null;
}

describe.skipIf(!url)('Meaning drafts (Postgres)', () => {
  let pool: pg.Pool;
  let content: PgContentRepository;
  let app: ReturnType<typeof createApp>;
  /** What the fake model answers per word; changed by the tests. */
  type Translate = (item: { place: string; de: string }, language: string) => string;
  const plain: Translate = (item, language) => `${language} ${item.de}`;
  let translate = plain;
  /** Runs while the model "thinks", before its answer is used. */
  let whileTheModelAnswers: (() => Promise<void>) | null = null;
  const prompts: string[] = [];

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
    content = new PgContentRepository(pool);
    await seedContent(content, DEFAULT_SEED_DIR, quiet);
    const gateway = {
      complete: async (
        _actor: unknown,
        task: string,
        input: { system: { text: string }[]; messages: { content: string }[] }
      ) => {
        expect(task).toBe('content.translate');
        prompts.push(input.system[0]!.text);
        const language = /into (\w+) for/.exec(input.system[0]!.text)![1]!;
        const { items } = JSON.parse(input.messages[0]!.content) as {
          items: { place: string; de: string }[];
        };
        await whileTheModelAnswers?.();
        return {
          text: JSON.stringify({
            translations: [
              ...items.map((item) => ({
                place: item.place,
                text: translate(item, language),
              })),
              // A word it was not asked for is ignored.
              { place: 'v-unknown', text: 'nope' },
            ],
          }),
          model: 'fake-model',
        };
      },
    };
    app = createApp({
      version: 'test',
      expectedRevision: null,
      health: {
        schemaRevision: async () => null,
        queueDepth: async () => ({ waiting: 0, active: 0, failed: 0, deadLetter: 0 }),
      },
      content: { repo: content, auth, log: quiet },
      meanings: {
        content,
        drafts: new PgMeaningDraftRepository(pool),
        gateway: gateway as never,
        auth,
        log: quiet,
      },
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  // Every test starts without drafts and with the plain fake model; the unit itself keeps
  // the edits of earlier tests, which no test relies on.
  beforeEach(async () => {
    translate = plain;
    whileTheModelAnswers = null;
    prompts.length = 0;
    await pool.query('truncate content_meaning_drafts');
    await pool.query(`delete from audit_log where action like 'content.meaning%'`);
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
  const words = async (language: string): Promise<WordRow[]> =>
    (
      (await (await call('GET', `${UNIT}/meanings/${language}`, 'teacher')).json()) as {
        words: WordRow[];
      }
    ).words;
  const review = (id: string, user: string, body: unknown) =>
    call('POST', `/api/v1/content/meaning-drafts/${id}/review`, user, body);
  /** A decision on the draft as the list shows it now. */
  const decide = (draft: { id: string; text: string }, user: string, body: object) =>
    review(draft.id, user, { ...body, seen: draft.text });

  /** Orders drafts in the language and returns the words with them. */
  const drafted = async (language = 'tr'): Promise<WordRow[]> => {
    const res = await call('POST', `${UNIT}/meanings/${language}/draft`, 'admin');
    expect(res.status).toBe(200);
    return words(language);
  };
  const unitNow = async () =>
    (await (await call('GET', UNIT, 'teacher')).json()) as UnitDetail;
  /** Saves the unit with its words changed, as an admin does in the CMS. */
  const editWords = async (
    change: (list: UnitDetail['draft']['vokabeln']) => UnitDetail['draft']['vokabeln']
  ) => {
    const unit = await unitNow();
    const res = await call('PUT', `${UNIT}/draft`, 'admin', {
      revision: unit.revision,
      content: { ...unit.draft, vokabeln: change(unit.draft.vokabeln) },
    });
    expect(res.status).toBe(200);
  };
  const setGerman = (wordId: string, de: string) =>
    editWords((list) =>
      list.map((word) => (word.id === wordId ? { ...word, de } : word))
    );

  it('drafts a unit’s words in the language asked for, for review only', async () => {
    const before = await words('tr');
    expect(before.length).toBeGreaterThan(5);
    expect(before.every((word) => word.draft === null)).toBe(true);

    // Only admins order drafts; only the four languages exist.
    expect((await call('POST', `${UNIT}/meanings/tr/draft`, 'teacher')).status).toBe(403);
    expect((await call('POST', `${UNIT}/meanings/tr/draft`, 'student')).status).toBe(403);
    expect((await call('POST', `${UNIT}/meanings/fr/draft`, 'admin')).status).toBe(404);
    expect((await call('GET', `${UNIT}/meanings/tr`, 'student')).status).toBe(403);
    expect((await call('GET', `${UNIT}/meanings/tr`)).status).toBe(401);

    const res = await call('POST', `${UNIT}/meanings/tr/draft`, 'admin');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ drafted: before.length, remaining: 0 });
    expect(prompts.at(-1)).toContain('into Turkish for Turkish-speaking');

    const after = await words('tr');
    for (const word of after) {
      expect(word.draft).toMatchObject({
        text: `Turkish ${word.de}`,
        status: 'draft',
        stale: false,
      });
    }
    // The other languages are untouched, and a second run has nothing to do.
    expect((await words('sq')).every((word) => word.draft === null)).toBe(true);
    const again = await call('POST', `${UNIT}/meanings/tr/draft`, 'admin');
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: 'nothing_to_translate' });

    const audit = await pool.query<{ actor_id: string; details: unknown }>(
      `select actor_id, details from audit_log where action = 'content.meanings_drafted'`
    );
    expect(audit.rows).toEqual([
      {
        actor_id: ADMIN,
        details: { language: 'tr', drafted: before.length, model: 'fake-model' },
      },
    ]);
  });

  it('lets a teacher approve, correct or reject each one, never the person who ordered it', async () => {
    const [first, second, third] = await drafted();
    // The admin ordered these drafts: four eyes.
    const own = await decide(first!.draft!, 'admin', { decision: 'approved' });
    expect(own.status).toBe(403);
    expect(await own.json()).toEqual({ error: 'own_draft' });
    expect(
      (await decide(first!.draft!, 'student', { decision: 'approved' })).status
    ).toBe(403);

    const approved = await decide(first!.draft!, 'teacher', { decision: 'approved' });
    expect(approved.status).toBe(200);
    expect(await approved.json()).toEqual({
      draft: { id: first!.draft!.id, text: first!.draft!.text, status: 'approved' },
    });
    const corrected = await decide(second!.draft!, 'teacher', {
      decision: 'approved',
      text: '  merhaba  ',
    });
    expect(((await corrected.json()) as { draft: { text: string } }).draft.text).toBe(
      'merhaba'
    );
    expect(
      (await decide(third!.draft!, 'teacher', { decision: 'rejected' })).status
    ).toBe(200);

    // Bodies that are not a decision, and ids that are not there.
    for (const body of [
      { decision: 'published', seen: 'x' },
      { decision: 'rejected', seen: 'x', text: 'x' },
      { decision: 'approved', seen: 'x', text: 'x'.repeat(MAX_MEANING_LENGTH + 1) },
      // A decision must name the text it is about.
      { decision: 'approved' },
      { decision: 'rejected' },
      {},
    ]) {
      expect((await review(first!.draft!.id, 'teacher', body)).status).toBe(400);
    }
    expect(
      (
        await review('00000000-0000-4000-8000-00000000ffff', 'teacher', {
          decision: 'rejected',
          seen: 'x',
        })
      ).status
    ).toBe(404);

    const now = await words('tr');
    expect(now.slice(0, 3).map((word) => word.draft?.status)).toEqual([
      'approved',
      'approved',
      'rejected',
    ]);
    const audit = await pool.query<{ actor_id: string; details: { decision: string } }>(
      `select actor_id, details from audit_log
        where action = 'content.meaning_reviewed' order by id`
    );
    expect(audit.rows.map((row) => [row.actor_id, row.details.decision])).toEqual([
      [TEACHER, 'approved'],
      [TEACHER, 'approved'],
      [TEACHER, 'rejected'],
    ]);
    expect(audit.rows[1]!.details).toMatchObject({ corrected: true, text: 'merhaba' });
  });

  it('drafts again what was rejected or whose German changed, and keeps the rest', async () => {
    const [approved, corrected, rejected, waiting] = await drafted();
    await decide(approved!.draft!, 'teacher', { decision: 'approved' });
    await decide(corrected!.draft!, 'teacher', { decision: 'approved', text: 'merhaba' });
    await decide(rejected!.draft!, 'teacher', { decision: 'rejected' });

    // The German of an approved word changes in the CMS: its meaning is stale.
    await setGerman(approved!.wordId, `${approved!.de} (neu)`);
    expect((await words('tr'))[0]!.draft).toMatchObject({
      status: 'approved',
      stale: true,
    });

    translate = (item) => `yeni ${item.de}`;
    const res = await call('POST', `${UNIT}/meanings/tr/draft`, 'admin');
    expect(await res.json()).toEqual({ drafted: 2, remaining: 0 });
    const after = await words('tr');
    expect(after[0]!.draft).toMatchObject({
      text: `yeni ${approved!.de} (neu)`,
      status: 'draft',
      stale: false,
    });
    expect(after[2]!.draft).toMatchObject({
      text: `yeni ${rejected!.de}`,
      status: 'draft',
    });
    // The corrected approval and the draft still waiting were not asked for again.
    expect(after[1]!.draft).toMatchObject({
      id: corrected!.draft!.id,
      text: 'merhaba',
      status: 'approved',
    });
    expect(after[3]!.draft).toEqual(waiting!.draft);
  });

  it('takes a decision only for the text the reviewer saw and the German it was made from', async () => {
    const [redrafted, edited, removed] = await drafted();

    // Drafted again after a rejection: a page loaded before still shows the old text.
    await decide(redrafted!.draft!, 'teacher', { decision: 'rejected' });
    translate = (item) => `yeni ${item.de}`;
    await call('POST', `${UNIT}/meanings/tr/draft`, 'admin');
    const unseen = await decide(redrafted!.draft!, 'teacher', { decision: 'approved' });
    expect(unseen.status).toBe(409);
    expect(await unseen.json()).toEqual({ error: 'draft_changed' });
    expect((await words('tr'))[0]!.draft!.status).toBe('draft');

    // The German changed since the draft, or the word left the unit.
    await setGerman(edited!.wordId, `${edited!.de} (anders)`);
    const late = await decide(edited!.draft!, 'teacher', { decision: 'approved' });
    expect(late.status).toBe(409);
    expect(await late.json()).toEqual({ error: 'source_changed' });
    await editWords((list) => list.filter((word) => word.id !== removed!.wordId));
    const gone = await decide(removed!.draft!, 'teacher', { decision: 'approved' });
    expect(gone.status).toBe(409);
    expect(await gone.json()).toEqual({ error: 'source_changed' });
    // Rejecting is always possible.
    expect(
      (await decide(edited!.draft!, 'teacher', { decision: 'rejected' })).status
    ).toBe(200);
  });

  it('drops a model answer made from German the word no longer has', async () => {
    const [slow] = await drafted();
    await decide(slow!.draft!, 'teacher', { decision: 'rejected' });

    // The first request is slow. Meanwhile the German changes, a second request drafts the
    // new German and the teacher approves it.
    const newGerman = `${slow!.de} (spät)`;
    whileTheModelAnswers = async () => {
      whileTheModelAnswers = null;
      await setGerman(slow!.wordId, newGerman);
      translate = (item) => `ikinci ${item.de}`;
      const second = await call('POST', `${UNIT}/meanings/tr/draft`, 'admin');
      expect(await second.json()).toEqual({ drafted: 1, remaining: 0 });
      const fresh = (await words('tr'))[0]!.draft!;
      expect((await decide(fresh, 'teacher', { decision: 'approved' })).status).toBe(200);
      translate = (item) => `eski ${item.de}`;
    };
    const first = await call('POST', `${UNIT}/meanings/tr/draft`, 'admin');
    // The old answer is for German that is gone: nothing is stored, the approval stays.
    expect(await first.json()).toEqual({ drafted: 0, remaining: 0 });
    expect((await words('tr'))[0]!.draft).toMatchObject({
      text: `ikinci ${newGerman}`,
      status: 'approved',
      stale: false,
    });
  });

  it('counts what is still missing after the unit changed under a draft run', async () => {
    const all = await words('sq');
    const target = all[0]!;
    whileTheModelAnswers = async () => {
      whileTheModelAnswers = null;
      await setGerman(target.wordId, `${target.de} (inzwischen)`);
    };
    const res = await call('POST', `${UNIT}/meanings/sq/draft`, 'admin');
    // The answer for the edited word is dropped, so that word is still to be drafted.
    expect(await res.json()).toEqual({ drafted: all.length - 1, remaining: 1 });
    expect((await words('sq'))[0]!.draft).toBeNull();
  });

  it('ignores answers that are empty or too long, and says so when nothing is left', async () => {
    translate = (item) => (item.place.endsWith('1') ? ' ' : 'x'.repeat(600));
    const res = await call('POST', `${UNIT}/meanings/it/draft`, 'admin');
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'ai_failed' });
    expect((await words('it')).every((word) => word.draft === null)).toBe(true);
  });

  it('keeps every draft away from learners: no bundle and no unit carries one', async () => {
    const [first, second] = await drafted();
    await decide(first!.draft!, 'teacher', { decision: 'approved', text: 'merhaba' });
    await decide(second!.draft!, 'teacher', { decision: 'approved' });

    const unit = await unitNow();
    expect(JSON.stringify(unit.draft)).not.toContain('merhaba');

    // Publish the unit with approved Turkish meanings in the table: the bundle has none.
    for (const [step, who] of [
      ['submit', 'admin'],
      ['check', 'teacher'],
      ['publish', 'admin'],
    ] as const) {
      const res = await call('POST', `${UNIT}/${step}`, who, { revision: unit.revision });
      expect(res.status).toBe(200);
    }
    const manifest = (await (await call('GET', '/api/v1/content/manifest')).json()) as {
      url: string;
    };
    const bundle = await (await call('GET', manifest.url)).text();
    expect(bundle).toContain(second!.de);
    expect(bundle).not.toContain('merhaba');
    expect(bundle).not.toContain('Turkish ');
  });
});
