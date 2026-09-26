/**
 * Lesson summaries of recordings against Postgres: queued by the teacher, written by the EU
 * model from the transcript, and seen by learners only once the teacher publishes them.
 * Run with SUFFA_TEST_DATABASE_URL.
 */
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { ModelRouter, type LlmProvider, type LlmRequest } from '@suffa/llm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AiGateway } from '../src/ai/gateway.js';
import { PgAiRepository } from '../src/ai/repository.js';
import { createApp } from '../src/app.js';
import type { AuthResolver } from '../src/auth/resolver.js';
import { PgClassRepository } from '../src/classes/repository.js';
import { PgInteractiveRepository } from '../src/media/interactive.js';
import { PgMediaRepository } from '../src/media/repository.js';
import { PgSummaryRepository, summarizeRecording } from '../src/media/summary.js';
import { loadMigrations, migrate } from '../src/migrate.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };
const TEACHER = '00000000-0000-4000-8000-0000000000d1';
const STUDENT = '00000000-0000-4000-8000-0000000000d2';

const SUMMARY = {
  overview: 'Die Lehrerin begrüßt die Klasse und übt das Vorstellen.',
  points: ['Sich mit Namen vorstellen', 'Sagen, woher man kommt'],
  vocabulary: [
    { ar: 'اِسْم', de: 'Name' },
    { ar: 'مِنْ', de: 'aus, von' },
  ],
  grammar: ['Das Possessivsuffix -ī: اِسْمِي'],
};

/** Stands in for Mistral; records what it was asked. */
class ScriptedMistral implements LlmProvider {
  readonly id = 'mistral' as const;
  requests: LlmRequest[] = [];
  reply = JSON.stringify(SUMMARY);
  async complete(request: LlmRequest) {
    this.requests.push(request);
    return {
      provider: 'mistral' as const,
      model: request.model,
      text: this.reply,
      stopReason: 'end' as const,
      usage: {
        inputTokens: 3000,
        outputTokens: 400,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      toolCalls: [],
    };
  }
  async *stream(request: LlmRequest) {
    yield { type: 'done' as const, result: await this.complete(request) };
  }
}

describe.skipIf(!url)('Recording summaries (Postgres)', () => {
  let pool: pg.Pool;
  let app: ReturnType<typeof createApp>;
  let model: ScriptedMistral;
  let run: () => Promise<void>;
  const queued: string[] = [];
  const classId = randomUUID();
  const mediaId = randomUUID();

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
         ($1, 't2@example.org', 'Frau Demir', 'teacher'), ($2, 's2@example.org', 'Amina', 'student')`,
      [TEACHER, STUDENT]
    );
    await pool.query(
      `insert into classes (id, name, created_by, ai_enabled) values ($1, 'Arabisch 1b', $2, true)`,
      [classId, TEACHER]
    );
    await pool.query(
      `insert into class_members (class_id, user_id, class_role, status)
       values ($1, $2, 'teacher', 'active'), ($1, $3, 'student', 'active')`,
      [classId, TEACHER, STUDENT]
    );
    await pool.query(
      `insert into media_items (id, class_id, created_by, title, source, status, original_key,
         original_size, content_type, duration_sec, published_at)
       values ($1, $2, $3, 'Stunde 4', 'upload', 'ready', 'k', 1, 'video/mp4', 600, now())`,
      [mediaId, classId, TEACHER]
    );
    const interactive = new PgInteractiveRepository(pool);
    await interactive.saveTranscript(mediaId, {
      status: 'ready',
      source: 'whisper',
      cues: [
        { start: 0, end: 5, text: 'Heute stellen wir uns vor.' },
        { start: 6, end: 12, text: 'اِسْمِي هُدى. أَنا مِنْ زيوريخ.' },
      ],
    });
    model = new ScriptedMistral();
    const aiRepo = new PgAiRepository(pool);
    const router = new ModelRouter({ providers: { mistral: model }, source: aiRepo });
    const summaries = new PgSummaryRepository(pool);
    const media = new PgMediaRepository(pool);
    run = () =>
      summarizeRecording(
        {
          gateway: new AiGateway({ router, repo: aiRepo, log: quiet }),
          summaries,
          media,
          interactive,
          log: quiet,
        },
        mediaId
      );
    const classes = new PgClassRepository(pool);
    const auth: AuthResolver = {
      actor: async (h) =>
        h.get('x-test-user') === 'teacher'
          ? { id: TEACHER, role: 'teacher' }
          : h.get('x-test-user') === 'student'
            ? { id: STUDENT, role: 'student' }
            : null,
    };
    app = createApp({
      version: 'test',
      expectedRevision: null,
      health: {
        schemaRevision: async () => null,
        queueDepth: async () => ({ waiting: 0, active: 0, failed: 0, deadLetter: 0 }),
      },
      interactive: {
        classes,
        media,
        interactive,
        summaries,
        canSummarize: async () => true,
        auth,
        log: quiet,
      },
      summaries: {
        classes,
        media,
        interactive,
        summaries,
        enqueue: async (id) => {
          queued.push(id);
        },
        available: async () => true,
        auth,
        log: quiet,
      },
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  const call = (method: string, path: string, body?: unknown, user = 'teacher') =>
    app.request(`/api/v1/classes/${classId}/media/${mediaId}${path}`, {
      method,
      headers: { 'x-test-user': user, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const summaryOf = async (user: string) =>
    (await (await call('GET', '/interactive', undefined, user)).json()) as {
      summary: {
        status: string;
        content: typeof SUMMARY | null;
        publishedAt: string | null;
      } | null;
      canSummarize: boolean;
    };

  it('summarises with Mistral and shows learners only a published summary', async () => {
    expect((await call('POST', '/summary', undefined, 'student')).status).toBe(403);
    expect((await call('POST', '/summary')).status).toBe(202);
    expect(queued).toEqual([mediaId]);
    await run();

    const sent = model.requests[0]!;
    expect(sent.model).toBe('ministral-14b-latest');
    expect((sent.messages[0] as { content: string }).content).toContain(
      '[6] اِسْمِي هُدى'
    );
    expect(sent.jsonSchema).toMatchObject({
      required: ['overview', 'points', 'vocabulary', 'grammar'],
    });

    const teacher = await summaryOf('teacher');
    expect(teacher.canSummarize).toBe(true);
    expect(teacher.summary).toMatchObject({
      status: 'ready',
      content: SUMMARY,
      publishedAt: null,
    });
    // Not published yet: learners see nothing.
    expect((await summaryOf('student')).summary).toBeNull();

    expect((await call('PUT', '/summary', { published: true })).status).toBe(204);
    expect((await summaryOf('student')).summary).toMatchObject({ content: SUMMARY });
    expect((await summaryOf('student')).canSummarize).toBe(false);

    expect((await call('PUT', '/summary', { published: false })).status).toBe(204);
    expect((await summaryOf('student')).summary).toBeNull();
  });

  it('a new summary starts unpublished again; a broken answer fails the run', async () => {
    await call('PUT', '/summary', { published: true });
    await call('POST', '/summary');
    model.reply = '{"overview": 5}';
    await run();
    const teacher = await summaryOf('teacher');
    expect(teacher.summary?.status).toBe('failed');
    model.reply = JSON.stringify(SUMMARY);
    await call('POST', '/summary');
    await run();
    const again = await summaryOf('teacher');
    expect(again.summary).toMatchObject({ status: 'ready', publishedAt: null });
  });

  it('calls the model once when two jobs run for the same request', async () => {
    await call('POST', '/summary');
    const before = model.requests.length;
    await Promise.all([run(), run()]);
    expect(model.requests.length).toBe(before + 1);
    expect((await summaryOf('teacher')).summary?.status).toBe('ready');
  });

  it('refuses without transcript access to AI (class switch off)', async () => {
    await pool.query('update classes set ai_enabled = false where id = $1', [classId]);
    expect((await call('POST', '/summary')).status).toBe(409);
    await pool.query('update classes set ai_enabled = true where id = $1', [classId]);
  });

  it('never routes recording tasks to Anthropic by default', async () => {
    const { rows } = await pool.query(
      `select task, provider, enabled from ai_model_routes
        where task like 'recording.%' and enabled order by task, position`
    );
    expect(rows.every((r) => r.provider === 'mistral')).toBe(true);
    expect(rows.map((r) => r.task)).toEqual([
      'recording.suggest',
      'recording.suggest',
      'recording.summarize',
      'recording.summarize',
    ]);
  });

  // Last: it rebuilds the schema.
  it('moves routes an admin put in front of the recording tasks out of the way', async () => {
    await pool.query('drop schema public cascade; create schema public');
    const all = await loadMigrations(join(import.meta.dirname, '..', 'migrations'));
    const at = all.findIndex((m) => m.id.startsWith('0025'));
    await migrate(pool, all.slice(0, at), quiet);
    await pool.query(
      `update ai_model_routes set provider = 'openrouter', model = 'some/us-model', enabled = true
        where task = 'recording.suggest' and position = 0`
    );
    await migrate(pool, all, quiet);
    const { rows } = await pool.query(
      `select position, provider, enabled from ai_model_routes
        where task = 'recording.suggest' order by position`
    );
    expect(rows.slice(0, 2).map((r) => r.provider)).toEqual(['mistral', 'mistral']);
    expect(rows.filter((r) => r.provider !== 'mistral').every((r) => !r.enabled)).toBe(
      true
    );
    expect(rows.some((r) => r.provider === 'openrouter')).toBe(true);
  });
});
