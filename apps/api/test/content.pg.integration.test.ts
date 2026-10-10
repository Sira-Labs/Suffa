/**
 * The content CMS against a real Postgres (story 16.1): seeding from the bundled unit files,
 * who may read, edit, check and publish, revisions, stable IDs and the audit trail.
 * Run with SUFFA_TEST_DATABASE_URL=postgres://… ; skipped otherwise. The database is wiped.
 */
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthResolver } from '../src/auth/resolver.js';
import { PgContentRepository, type UnitDetail } from '../src/content/repository.js';
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

  it('seeds every bundled unit once, published as learners see it', async () => {
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
});
