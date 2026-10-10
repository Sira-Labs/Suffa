/**
 * The content CMS against a real Postgres (stories 16.1, 16.2): seeding from the bundled unit
 * files, who may read, edit, check and publish, revisions, stable IDs, the audit trail, and the
 * immutable bundles learners download (manifest, checksum, caching, tombstones).
 * Run with SUFFA_TEST_DATABASE_URL=postgres://… ; skipped otherwise. The database is wiped.
 */
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthResolver } from '../src/auth/resolver.js';
import { PgContentRepository, type UnitDetail } from '../src/content/repository.js';
import type { ContentBundle } from '../src/content/bundles.js';
import type { UnitContent } from '../src/content/schema.js';
import { DEFAULT_SEED_DIR, seedContent } from '../src/content/seed.js';
import { loadMigrations, migrate } from '../src/migrate.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };
const ADMIN = '00000000-0000-4000-8000-0000000000c1';
const TEACHER = '00000000-0000-4000-8000-0000000000c2';
const STUDENT = '00000000-0000-4000-8000-0000000000c3';
const UNIT = '/api/v1/content/units/bayna-yadayk/1';

describe.skipIf(!url)('Content CMS (Postgres)', () => {
  let pool: pg.Pool;
  let repo: PgContentRepository;
  let app: ReturnType<typeof createApp>;

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
        if (who === 'admin-no-2fa') return { id: ADMIN, role: 'admin' };
        if (who === 'teacher') return { id: TEACHER, role: 'teacher' };
        if (who === 'student') return { id: STUDENT, role: 'student' };
        return null;
      },
    };
    repo = new PgContentRepository(pool);
    app = createApp({
      version: 'test',
      expectedRevision: null,
      health: {
        schemaRevision: async () => null,
        queueDepth: async () => ({ waiting: 0, active: 0, failed: 0, deadLetter: 0 }),
      },
      content: { repo, auth, log: quiet },
    });
  });

  afterAll(async () => {
    await pool?.end();
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
  const detail = async (): Promise<UnitDetail> =>
    (await (await call('GET', UNIT, 'teacher')).json()) as UnitDetail;
  const audit = async (action: string) =>
    (
      await pool.query<{ actor_id: string | null; details: Record<string, unknown> }>(
        `select actor_id, details from audit_log where action = $1 order by id`,
        [action]
      )
    ).rows;

  const manifest = async () =>
    (await (await call('GET', '/api/v1/content/manifest')).json()) as {
      version: number;
      checksum: string;
      size: number;
      url: string;
    };
  const bundle = async (version: number) => {
    const res = await call('GET', `/api/v1/content/bundles/${version}`);
    const text = await res.text();
    return { res, text, json: JSON.parse(text) as ContentBundle };
  };

  it('seeds every bundled unit once, published as learners see it', async () => {
    // Before any content there is no bundle to fetch.
    expect((await call('GET', '/api/v1/content/manifest')).status).toBe(404);
    expect(await seedContent(repo, DEFAULT_SEED_DIR, quiet)).toBe(16);
    expect(await seedContent(repo, DEFAULT_SEED_DIR, quiet)).toBe(0);

    const res = await call('GET', '/api/v1/content/units', 'teacher');
    expect(res.status).toBe(200);
    const { units } = (await res.json()) as { units: UnitDetail[] };
    expect(units.map((u) => u.id).slice(0, 3)).toEqual([
      'bayna-yadayk/1',
      'bayna-yadayk/2',
      'bayna-yadayk/3',
    ]);
    expect(units.every((u) => u.state === 'published' && u.revision === 1)).toBe(true);
    // The bundled units are own drafts nobody checked yet.
    expect(units.some((u) => u.checked)).toBe(false);
    expect(units[0]!.counts.vokabeln).toBeGreaterThan(10);

    const unit = await detail();
    expect(unit.published).toMatchObject({ einheit: 1, status: 'entwurf' });
    expect(unit.changes).toEqual({
      added: [],
      removed: [],
      changed: [],
      textChanged: false,
      english: [],
    });
    expect(await audit('content.units_seeded')).toHaveLength(1);
    const { rows } = await pool.query(`select count(*)::int as n from content_ids`);
    expect(rows[0].n).toBeGreaterThan(400);
  });

  it('lets teachers read and check, and only admins with the second factor edit', async () => {
    expect((await call('GET', '/api/v1/content/units')).status).toBe(401);
    expect((await call('GET', '/api/v1/content/units', 'student')).status).toBe(403);
    expect((await call('GET', UNIT, 'student')).status).toBe(403);
    const unit = await detail();
    const body = { revision: unit.revision, content: unit.draft };
    expect((await call('PUT', `${UNIT}/draft`, 'teacher', body)).status).toBe(403);
    expect((await call('PUT', `${UNIT}/draft`, 'admin-no-2fa', body)).status).toBe(403);
    expect(
      (await call('POST', `${UNIT}/publish`, 'teacher', { revision: 1 })).status
    ).toBe(403);
    expect(
      (await call('GET', '/api/v1/content/units/bayna-yadayk/99', 'teacher')).status
    ).toBe(404);
    expect(
      (await call('GET', '/api/v1/content/units/Bad Course/1', 'teacher')).status
    ).toBe(404);
  });

  it('saves a draft against its revision and tracks what changed', async () => {
    const unit = await detail();
    const draft: UnitContent = structuredClone(unit.draft);
    const first = draft.vokabeln[0]!;
    first.de = `${first.de} (geändert)`;
    const removed = draft.vokabeln.pop()!;
    draft.vokabeln.push({
      id: 'v-cms-test',
      ar: 'تَجْرِبَة',
      tr: 'taǧriba',
      de: 'Versuch',
      wurzel: 'ج-ر-ب',
      einheit: 1,
    });

    const res = await call('PUT', `${UNIT}/draft`, 'admin', {
      revision: 1,
      content: draft,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revision: 2 });

    const saved = await detail();
    expect(saved).toMatchObject({
      state: 'draft',
      revision: 2,
      updatedBy: 'chef@example.org',
    });
    expect(saved.changes).toEqual({
      added: ['v-cms-test'],
      removed: [removed.id],
      changed: [first.id],
      textChanged: false,
      english: [],
    });
    // Learners still get the published unit.
    expect(saved.published!.vokabeln[0]!.de).toBe(unit.draft.vokabeln[0]!.de);

    const [entry] = await audit('content.unit_saved');
    expect(entry).toMatchObject({
      actor_id: ADMIN,
      details: {
        revision: 2,
        added: ['v-cms-test'],
        removed: [removed.id],
        counts: { added: 1, removed: 1, changed: 1 },
      },
    });

    // The same revision again: someone else was faster.
    const stale = await call('PUT', `${UNIT}/draft`, 'admin', {
      revision: 1,
      content: draft,
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: 'stale_revision' });
  });

  it('refuses invalid content and IDs of other units', async () => {
    const unit = await detail();
    const wrong = structuredClone(unit.draft);
    wrong.vokabeln[0]!.einheit = 2;
    const invalid = await call('PUT', `${UNIT}/draft`, 'admin', {
      revision: unit.revision,
      content: wrong,
    });
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toEqual({
      error: 'invalid_content',
      issues: ['vokabeln.0.einheit: must be 1'],
    });

    const other = await repo.get('bayna-yadayk/2');
    const borrowed = structuredClone(unit.draft);
    borrowed.vokabeln.push({ ...other!.draft.vokabeln[0]!, einheit: 1 });
    const taken = await call('PUT', `${UNIT}/draft`, 'admin', {
      revision: unit.revision,
      content: borrowed,
    });
    expect(taken.status).toBe(422);
    expect(await taken.json()).toEqual({
      error: 'id_taken',
      issues: [`id ${other!.draft.vokabeln[0]!.id} belongs to bayna-yadayk/2`],
    });

    expect(
      (await call('PUT', `${UNIT}/draft`, 'admin', { revision: unit.revision })).status
    ).toBe(400);
    expect((await detail()).revision).toBe(unit.revision);
  });

  it('keeps a removed ID with its unit: bringing it back is fine', async () => {
    const unit = await detail();
    const removedId = unit.changes.removed[0]!;
    const published = unit.published!.vokabeln.find((v) => v.id === removedId)!;
    const restored = structuredClone(unit.draft);
    restored.vokabeln.push(published);
    const res = await call('PUT', `${UNIT}/draft`, 'admin', {
      revision: unit.revision,
      content: restored,
    });
    expect(res.status).toBe(200);
    expect((await detail()).changes.removed).toEqual([]);
  });

  it('goes through review: submit, send back, check, publish', async () => {
    let unit = await detail();
    const step = (name: string, user: string, extra: object = {}) =>
      call('POST', `${UNIT}/${name}`, user, { revision: unit.revision, ...extra });

    // Nothing to check or publish while it is a draft.
    expect((await step('check', 'teacher')).status).toBe(409);
    expect((await step('publish', 'admin')).status).toBe(409);

    expect((await step('submit', 'admin')).status).toBe(200);
    unit = await detail();
    expect(unit.state).toBe('review');

    expect((await step('return', 'teacher', { note: '' })).status).toBe(400);
    expect(
      (await step('return', 'teacher', { note: 'Bitte v-cms-test prüfen.' })).status
    ).toBe(200);
    unit = await detail();
    expect(unit).toMatchObject({
      state: 'draft',
      reviewNote: 'Bitte v-cms-test prüfen.',
    });

    expect((await step('submit', 'admin')).status).toBe(200);
    unit = await detail();
    expect(unit.reviewNote).toBeNull();
    expect((await step('check', 'teacher')).status).toBe(200);
    unit = await detail();
    expect(unit).toMatchObject({ checked: true, checkedBy: 'lehrerin@example.org' });

    expect(
      (await call('POST', `${UNIT}/publish`, 'admin', { revision: unit.revision - 1 }))
        .status
    ).toBe(409);
    expect((await step('publish', 'admin')).status).toBe(200);
    unit = await detail();
    expect(unit).toMatchObject({
      state: 'published',
      publishedRevision: unit.revision,
      changes: { added: [], removed: [], changed: [], textChanged: false },
    });
    // Checked content reaches learners marked as checked.
    expect(unit.published).toMatchObject({ einheit: 1, status: 'geprueft' });
    expect(unit.published!.vokabeln.some((v) => v.id === 'v-cms-test')).toBe(true);

    for (const action of [
      'content.unit_submitted',
      'content.unit_returned',
      'content.unit_checked',
      'content.unit_published',
    ]) {
      expect((await audit(action)).length, action).toBeGreaterThan(0);
    }
    expect((await audit('content.unit_returned'))[0]!.details).toMatchObject({
      note: 'Bitte v-cms-test prüfen.',
      from: 'review',
    });
  });

  it('makes a check stale when the unit changes again', async () => {
    const unit = await detail();
    const draft = structuredClone(unit.draft);
    draft.kulturnotiz = 'Neue Kulturnotiz.';
    await call('PUT', `${UNIT}/draft`, 'admin', {
      revision: unit.revision,
      content: draft,
    });
    const changed = await detail();
    expect(changed).toMatchObject({ state: 'draft', checked: false });
    expect(changed.changes.textChanged).toBe(true);
    // The published unit keeps its checked status until the next publish.
    expect(changed.published).toMatchObject({ status: 'geprueft' });
  });

  it('never overwrites edited units when seeding again', async () => {
    expect(await seedContent(repo, DEFAULT_SEED_DIR, quiet)).toBe(0);
    expect((await detail()).draft.kulturnotiz).toBe('Neue Kulturnotiz.');
  });

  it('serves the published units as an immutable, checksummed bundle (16.2)', async () => {
    // Seeding froze bundle 1; the publish in the review test froze bundle 2.
    const latest = await manifest();
    expect(latest).toMatchObject({ version: 2, url: '/api/v1/content/bundles/2' });

    const first = await bundle(1);
    expect(first.res.status).toBe(200);
    expect(first.res.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable'
    );
    expect(first.json).toMatchObject({ format: 1, version: 1, course: 'bayna-yadayk' });
    expect(first.json.units).toHaveLength(16);
    expect(first.json.tombstones).toEqual([]);

    const second = await bundle(2);
    // The checksum covers the bytes exactly as served.
    expect(createHash('sha256').update(second.text).digest('hex')).toBe(latest.checksum);
    expect(Buffer.byteLength(second.text)).toBe(latest.size);
    expect(second.json.units[0]).toMatchObject({ einheit: 1, status: 'geprueft' });
    expect(second.json.units[0]!.vokabeln.some((v) => v.id === 'v-cms-test')).toBe(true);

    const etag = second.res.headers.get('etag')!;
    expect(etag).toBe(`"${latest.checksum}"`);
    const cached = await app.request('/api/v1/content/bundles/2', {
      headers: { 'if-none-match': etag },
    });
    expect(cached.status).toBe(304);
    expect((await call('GET', '/api/v1/content/bundles/99')).status).toBe(404);
    expect((await call('GET', '/api/v1/content/bundles/abc')).status).toBe(404);

    // Bundles never change, not even by accident in SQL.
    await expect(
      pool.query(`update content_bundles set body = '{}' where version = 1`)
    ).rejects.toThrow(/immutable/);
    await expect(
      pool.query(`delete from content_bundles where version = 1`)
    ).rejects.toThrow(/immutable/);
  });

  it('tombstones removed items and keeps them for SRS cards until they come back', async () => {
    const publishWith = async (edit: (draft: UnitContent) => void) => {
      const unit = await detail();
      const draft = structuredClone(unit.draft);
      edit(draft);
      await call('PUT', `${UNIT}/draft`, 'admin', {
        revision: unit.revision,
        content: draft,
      });
      const saved = await detail();
      await call('POST', `${UNIT}/submit`, 'admin', { revision: saved.revision });
      const res = await call('POST', `${UNIT}/publish`, 'admin', {
        revision: saved.revision,
      });
      expect(res.status).toBe(200);
    };

    const removed = (await detail()).draft.vokabeln.find((v) => v.id === 'v-cms-test')!;
    await publishWith((draft) => {
      draft.vokabeln = draft.vokabeln.filter((v) => v.id !== 'v-cms-test');
    });
    const without = await bundle((await manifest()).version);
    expect(without.json.units[0]!.vokabeln.some((v) => v.id === 'v-cms-test')).toBe(
      false
    );
    expect(without.json.tombstones).toEqual([
      { id: 'v-cms-test', kind: 'vocab', unit: 1, item: removed },
    ]);
    const [published] = await audit('content.unit_published').then((rows) =>
      rows.slice(-1)
    );
    expect(published!.details).toMatchObject({ bundle: without.json.version });

    // Another publish keeps the tombstone …
    await publishWith((draft) => {
      draft.kulturnotiz = 'Noch eine Kulturnotiz.';
    });
    const later = await bundle((await manifest()).version);
    expect(later.json.tombstones.map((t) => t.id)).toEqual(['v-cms-test']);

    // … until the item comes back.
    await publishWith((draft) => {
      draft.vokabeln.push(removed);
    });
    const back = await bundle((await manifest()).version);
    expect(back.json.tombstones).toEqual([]);
  });

  it('follows changed seed files only for units nobody edited, in a new bundle', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'suffa-seed-'));
    await cp(DEFAULT_SEED_DIR, dir, { recursive: true });
    const edit = async (
      name: string,
      change: (file: { vokabeln: { de: string }[] }) => void
    ) => {
      const path = join(dir, name);
      const file = JSON.parse(await readFile(path, 'utf8'));
      change(file);
      await writeFile(path, JSON.stringify(file));
    };
    await edit('einheit-01.json', (f) => {
      f.vokabeln[0]!.de = 'aus der Datei';
    });
    await edit('einheit-02.json', (f) => {
      f.vokabeln[0]!.de = 'korrigiert in der Datei';
    });
    const before = (await manifest()).version;

    expect(await seedContent(repo, dir, quiet)).toBe(1);
    // Unit 2 was never touched in the CMS: it follows the file. Unit 1 belongs to the CMS.
    const two = await repo.get('bayna-yadayk/2');
    expect(two!.draft.vokabeln[0]!.de).toBe('korrigiert in der Datei');
    expect(two!.published!.vokabeln[0]!.de).toBe('korrigiert in der Datei');
    expect((await detail()).draft.vokabeln[0]!.de).not.toBe('aus der Datei');
    expect(await audit('content.units_reseeded')).toHaveLength(1);

    const next = await bundle((await manifest()).version);
    expect(next.json.version).toBe(before + 1);
    expect(next.json.units[1]!.vokabeln[0]!.de).toBe('korrigiert in der Datei');

    // Nothing changed since: no new bundle.
    expect(await seedContent(repo, dir, quiet)).toBe(0);
    expect((await manifest()).version).toBe(before + 1);
  });

  it('drafts missing English with the LLM and publishes it only after a check (16.4)', async () => {
    const UNIT2 = '/api/v1/content/units/bayna-yadayk/2';
    const asked: string[] = [];
    const gateway = {
      complete: async (
        _actor: unknown,
        task: string,
        input: { messages: { content: string }[] }
      ) => {
        expect(task).toBe('content.translate');
        const { items } = JSON.parse(input.messages[0]!.content) as {
          items: { place: string; de: string }[];
        };
        asked.push(...items.map((i) => i.place));
        return {
          text: JSON.stringify({
            translations: [
              ...items.map((i) => ({ place: i.place, en: `EN ${i.de}` })),
              // A place it was not asked for is ignored.
              { place: 'v-unknown', en: 'nope' },
            ],
          }),
          model: 'fake-model',
        };
      },
    };
    const ai = createApp({
      version: 'test',
      expectedRevision: null,
      health: {
        schemaRevision: async () => null,
        queueDepth: async () => ({ waiting: 0, active: 0, failed: 0, deadLetter: 0 }),
      },
      content: {
        repo,
        auth: { actor: async () => ({ id: ADMIN, role: 'admin', secondFactor: true }) },
        log: quiet,
        gateway: gateway as never,
      },
    });
    const get = async () =>
      (await (await call('GET', UNIT2, 'teacher')).json()) as UnitDetail;
    const post = (path: string, user: string, body: unknown) =>
      call('POST', `${UNIT2}/${path}`, user, body);

    // An English gloss someone wrote by hand stays as it is.
    let unit = await get();
    const draft = structuredClone(unit.draft);
    const kept = draft.vokabeln[0]!;
    kept.en = 'written by hand';
    expect(
      (
        await call('PUT', `${UNIT2}/draft`, 'admin', {
          revision: unit.revision,
          content: draft,
        })
      ).status
    ).toBe(200);
    unit = await get();

    // Teachers may not start drafts; admins may.
    expect((await post('translate', 'teacher', { revision: unit.revision })).status).toBe(
      403
    );
    const res = await ai.request(`${UNIT2}/translate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ revision: unit.revision }),
    });
    expect(res.status).toBe(200);
    const drafted = (await res.json()) as { filled: number; remaining: number };
    expect(drafted.remaining).toBe(0);
    expect(asked).not.toContain(kept.id);
    unit = await get();
    expect(unit.draft.vokabeln[0]!.en).toBe('written by hand');
    expect(unit.draft.vokabeln[1]!.en).toBe(`EN ${unit.draft.vokabeln[1]!.de}`);
    expect(unit.draft.dialoge[0]!.zeilen[0]!.en).toMatch(/^EN /);
    expect(unit.changes.english.length).toBe(drafted.filled + 1);
    expect(JSON.stringify(unit.draft)).not.toContain('nope');

    // Nothing left: a second draft has nothing to do.
    const again = await ai.request(`${UNIT2}/translate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ revision: unit.revision }),
    });
    expect(again.status).toBe(409);

    // Unchecked English never reaches learners: publishing waits for a teacher's check.
    expect((await post('submit', 'admin', { revision: unit.revision })).status).toBe(200);
    const refused = await post('publish', 'admin', { revision: unit.revision });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: 'translation_unreviewed' });
    expect((await post('check', 'teacher', { revision: unit.revision })).status).toBe(
      200
    );
    expect((await post('publish', 'admin', { revision: unit.revision })).status).toBe(
      200
    );
    unit = await get();
    expect(unit.published!.vokabeln[1]!.en).toMatch(/^EN /);
    expect(unit.changes.english).toEqual([]);
    const bundle = (await (
      await app.request(`/api/v1/content/bundles/${(await manifest()).version}`)
    ).json()) as ContentBundle;
    const published = bundle.units.find((u) => u.einheit === 2)!;
    expect(published.vokabeln[0]!.en).toBe('written by hand');
  });
});
