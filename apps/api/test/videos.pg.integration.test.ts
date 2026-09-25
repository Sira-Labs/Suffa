/**
 * Video catalog against Postgres (stories 12.1, 12.3, 12.4): admin creates a channel, the
 * import fills it (units guessed, admin mapping kept), permission gates transcripts and
 * checkpoints, changes are audit-logged. Run with SUFFA_TEST_DATABASE_URL.
 */
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthResolver } from '../src/auth/resolver.js';
import { loadMigrations, migrate } from '../src/migrate.js';
import { importChannel } from '../src/videos/jobs.js';
import { PgVideoRepository } from '../src/videos/repository.js';
import type { YouTubeVideo } from '../src/videos/youtube.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };
const ADMIN = '00000000-0000-4000-8000-0000000000e1';

const video = (id: string, title: string, position: number): YouTubeVideo => ({
  youtubeId: id,
  title,
  durationSec: 600,
  thumbnailUrl: null,
  publishedAt: null,
  playlistId: 'PLandalusi-book1',
  position,
});

describe.skipIf(!url)('Video catalog (Postgres)', () => {
  let pool: pg.Pool;
  let repo: PgVideoRepository;
  let app: ReturnType<typeof createApp>;
  const queued: string[] = [];
  let playlist: YouTubeVideo[] = [];

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    await pool.query('drop schema public cascade; create schema public');
    await migrate(
      pool,
      await loadMigrations(join(import.meta.dirname, '..', 'migrations')),
      quiet
    );
    await pool.query(
      `insert into users (id, email, role) values ($1, 'a@example.org', 'admin')`,
      [ADMIN]
    );
    repo = new PgVideoRepository(pool);
    const auth: AuthResolver = {
      actor: async (h) =>
        h.get('x-test-user') === 'admin'
          ? { id: ADMIN, role: 'admin', secondFactor: true }
          : h.get('x-test-user') === 'student'
            ? { id: ADMIN, role: 'student' }
            : null,
    };
    app = createApp({
      version: 'test',
      expectedRevision: null,
      health: {
        schemaRevision: async () => null,
        queueDepth: async () => ({ waiting: 0, active: 0, failed: 0, deadLetter: 0 }),
      },
      videos: {
        videos: repo,
        enqueueImport: async (id) => {
          queued.push(id);
        },
        auth,
        log: quiet,
      },
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  const call = (method: string, path: string, body?: unknown, user = 'admin') =>
    app.request(`/api/v1${path}`, {
      method,
      headers: { 'x-test-user': user, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  it('imports a channel, maps units and gates the interactive parts by permission', async () => {
    const created = await call('POST', '/admin/videos/channels', {
      name: 'Muhammad al-Andalusi',
      playlists: ['PLandalusi-book1'],
    });
    expect(created.status).toBe(201);
    const { id: channelId } = (await created.json()) as { id: string };
    expect(
      (await call('POST', `/admin/videos/channels/${channelId}/import`)).status
    ).toBe(202);
    expect(queued).toEqual([channelId]);

    playlist = [
      video('aaaaaaaaaa1', 'الدرس ١ – التحية', 0),
      video('bbbbbbbbbb2', 'مقدمة الكتاب', 1),
    ];
    const youtube = { playlist: async () => playlist };
    expect(await importChannel({ videos: repo, youtube, log: quiet }, channelId)).toBe(2);

    const admin = (await (await call('GET', '/admin/videos')).json()) as {
      channels: { videoCount: number; lastImportAt: string | null }[];
      videos: { id: string; youtubeId: string; unit: number | null }[];
      importEnabled: boolean;
    };
    expect(admin.importEnabled).toBe(true);
    expect(admin.channels[0]).toMatchObject({ videoCount: 2 });
    expect(admin.channels[0]!.lastImportAt).not.toBeNull();
    expect(admin.videos.map((v) => [v.youtubeId, v.unit])).toEqual([
      ['aaaaaaaaaa1', 1],
      ['bbbbbbbbbb2', null],
    ]);

    // The admin maps the introduction to unit 1; a re-import keeps that and updates titles.
    const intro = admin.videos.find((v) => v.youtubeId === 'bbbbbbbbbb2')!;
    expect((await call('PATCH', `/admin/videos/${intro.id}`, { unit: 1 })).status).toBe(
      204
    );
    playlist = [
      video('aaaaaaaaaa1', 'الدرس ١ – التحية (جديد)', 0),
      video('bbbbbbbbbb2', 'مقدمة', 1),
    ];
    expect(await importChannel({ videos: repo, youtube, log: quiet }, channelId)).toBe(0);
    const lesson1 = admin.videos.find((v) => v.youtubeId === 'aaaaaaaaaa1')!;

    // Checkpoints and a transcript exist, but learners see them only once permission is granted.
    await call('POST', `/admin/videos/${lesson1.id}/checkpoints`, {
      atSec: 30,
      data: { kind: 'vocab_flash', ar: 'مَرْحَبًا', de: 'Hallo' },
    });
    await call('PUT', `/admin/videos/${lesson1.id}/transcript`, {
      cues: [{ start: 0, end: 4, text: 'السَّلامُ عَلَيْكُمْ' }],
    });
    const listed = (await (await app.request('/api/v1/videos?unit=1')).json()) as {
      videos: { title: string; interactive: boolean; channel: { name: string } }[];
    };
    expect(listed.videos.map((v) => v.title)).toEqual([
      'الدرس ١ – التحية (جديد)',
      'مقدمة',
    ]);
    expect(listed.videos[0]).toMatchObject({
      interactive: false,
      channel: { name: 'Muhammad al-Andalusi' },
    });
    const gated = (await (await app.request(`/api/v1/videos/${lesson1.id}`)).json()) as {
      checkpoints: unknown[];
      transcript: unknown[];
    };
    expect(gated).toMatchObject({ checkpoints: [], transcript: [] });

    expect(
      (
        await call('PATCH', `/admin/videos/channels/${channelId}`, {
          permissionStatus: 'granted',
          permissionNotes: 'Zusage per E-Mail vom 20.03.',
          contactedAt: '2027-03-10',
        })
      ).status
    ).toBe(204);
    const open = (await (await app.request(`/api/v1/videos/${lesson1.id}`)).json()) as {
      video: { interactive: boolean };
      checkpoints: { atSec: number }[];
      transcript: { text: string }[];
    };
    expect(open.video.interactive).toBe(true);
    expect(open.checkpoints.map((c) => c.atSec)).toEqual([30]);
    expect(open.transcript[0]!.text).toBe('السَّلامُ عَلَيْكُمْ');
    const audit = await pool.query(
      "select action, details from audit_log where action like 'video.%' order by id"
    );
    expect(audit.rows.map((r) => r.action)).toEqual([
      'video.channel_created',
      'video.permission_changed',
    ]);
    expect(audit.rows[1].details).toMatchObject({
      from: 'unknown',
      permissionStatus: 'granted',
    });

    expect(await repo.hasVisibleVideos()).toBe(true);
    // Hidden videos disappear for learners.
    await call('PATCH', `/admin/videos/${intro.id}`, { hidden: true });
    const after = (await (await app.request('/api/v1/videos')).json()) as {
      videos: unknown[];
    };
    expect(after.videos).toHaveLength(1);
    expect((await app.request(`/api/v1/videos/${intro.id}`)).status).toBe(404);
  });

  it('keeps the catalog tools to admins and validates input', async () => {
    expect((await call('GET', '/admin/videos', undefined, 'student')).status).toBe(403);
    expect((await call('GET', '/admin/videos', undefined, '')).status).toBe(401);
    expect(
      (await call('POST', '/admin/videos/channels', { name: '', playlists: [] })).status
    ).toBe(400);
    expect(
      (
        await call('POST', '/admin/videos/channels', {
          name: 'x',
          playlists: ['not a playlist'],
        })
      ).status
    ).toBe(400);
    expect((await app.request('/api/v1/videos/not-a-uuid')).status).toBe(404);
  });
});
