/**
 * AI suggestions for recordings against Postgres (story 11.4): queued by the teacher, made
 * from the transcript by the worker, invalid proposals dropped, and nothing reaching learners
 * until the teacher accepts it. Run with SUFFA_TEST_DATABASE_URL.
 */
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModelRouter, type LlmProvider, type LlmRequest } from '@suffa/llm';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AiGateway } from '../src/ai/gateway.js';
import { PgAiRepository } from '../src/ai/repository.js';
import { createApp } from '../src/app.js';
import type { AuthResolver } from '../src/auth/resolver.js';
import { PgClassRepository } from '../src/classes/repository.js';
import { PgInteractiveRepository } from '../src/media/interactive.js';
import { PgMediaRepository } from '../src/media/repository.js';
import { PgSuggestionRepository, suggestForRecording } from '../src/media/suggestions.js';
import { loadMigrations, migrate } from '../src/migrate.js';
import { ContentCatalog } from '../src/tutor/content.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };
const TEACHER = '00000000-0000-4000-8000-0000000000c1';
const STUDENT = '00000000-0000-4000-8000-0000000000c2';

const PROPOSAL = {
  chapters: [
    { atSec: 0, title: 'Begrüßung' },
    { atSec: 95, title: 'Neue Wörter: Schule' },
    { atSec: 9999, title: 'Nach dem Ende' },
  ],
  checkpoints: [
    {
      atSec: 100,
      kind: 'vocab_flash',
      question: '',
      options: [],
      answer: 0,
      ar: 'اِسْم',
      de: 'Name',
    },
    {
      atSec: 120,
      kind: 'mcq',
      question: 'Wie heißt die Lehrerin?',
      options: ['Sara', 'Amina', 'Huda'],
      answer: 2,
      ar: '',
      de: '',
    },
    {
      atSec: 130,
      kind: 'mcq',
      question: 'Kaputt: Antwort außerhalb',
      options: ['a', 'b'],
      answer: 5,
      ar: '',
      de: '',
    },
    {
      atSec: 150,
      kind: 'dictation',
      question: '',
      options: [],
      answer: 0,
      ar: 'أَنا مِنْ زيوريخ',
      de: 'Woher kommt sie?',
    },
  ],
};

class ScriptedModel implements LlmProvider {
  readonly id = 'anthropic' as const;
  requests: LlmRequest[] = [];
  reply = JSON.stringify(PROPOSAL);
  async complete(request: LlmRequest) {
    this.requests.push(request);
    return {
      provider: 'anthropic' as const,
      model: request.model,
      text: this.reply,
      stopReason: 'end' as const,
      usage: {
        inputTokens: 4000,
        outputTokens: 600,
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

describe.skipIf(!url)('Recording suggestions (Postgres)', () => {
  let pool: pg.Pool;
  let app: ReturnType<typeof createApp>;
  let model: ScriptedModel;
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
         ($1, 't@example.org', 'Frau Demir', 'teacher'), ($2, 's@example.org', 'Amina', 'student')`,
      [TEACHER, STUDENT]
    );
    await pool.query(
      `insert into classes (id, name, created_by) values ($1, 'Arabisch 1a', $2)`,
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
       values ($1, $2, $3, 'Stunde 3', 'upload', 'ready', 'k', 1, 'audio/mp4', 600, now())`,
      [mediaId, classId, TEACHER]
    );
    const interactive = new PgInteractiveRepository(pool);
    await interactive.saveTranscript(mediaId, {
      status: 'ready',
      source: 'whisper',
      cues: [
        { start: 0, end: 5, text: 'السَّلامُ عَلَيْكُمْ' },
        { start: 95, end: 110, text: 'ما اسْمُكِ؟ اسمي هدى.' },
        { start: 145, end: 152, text: 'أَنا مِنْ زيوريخ' },
      ],
    });
    model = new ScriptedModel();
    const aiRepo = new PgAiRepository(pool);
    const router = new ModelRouter({ providers: { anthropic: model }, source: aiRepo });
    const suggestions = new PgSuggestionRepository(pool);
    const catalog = await ContentCatalog.load(
      fileURLToPath(new URL('../../web/src/content', import.meta.url))
    );
    run = () =>
      suggestForRecording(
        {
          gateway: new AiGateway({ router, repo: aiRepo, log: quiet }),
          suggestions,
          media: new PgMediaRepository(pool),
          interactive,
          catalog,
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
    const media = new PgMediaRepository(pool);
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
        chapters: suggestions,
        canSuggest: async () => true,
        auth,
        log: quiet,
      },
      suggestions: {
        classes,
        media,
        interactive,
        suggestions,
        enqueue: async (id) => {
          queued.push(id);
        },
        available: async () => true,
        auth,
        log: quiet,
      },
    });
  });

  beforeEach(async () => {
    await pool.query('update classes set ai_enabled = true');
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

  it('suggests from the transcript and publishes only what the teacher accepts', async () => {
    expect((await call('POST', '/suggestions')).status).toBe(202);
    expect(queued).toEqual([mediaId]);
    await run();
    const sent = model.requests[0]!;
    expect(sent.messages[0]).toMatchObject({ role: 'user' });
    expect((sent.messages[0] as { content: string }).content).toContain(
      '[95] ما اسْمُكِ؟'
    );
    expect(sent.jsonSchema).toMatchObject({ required: ['chapters', 'checkpoints'] });

    const listed = (await (await call('GET', '/suggestions')).json()) as {
      run: { status: string };
      suggestions: {
        id: string;
        kind: string;
        atSec: number;
        data: Record<string, unknown>;
      }[];
    };
    expect(listed.run.status).toBe('ready');
    // The chapter after the end and the broken question are dropped.
    expect(listed.suggestions.map((s) => `${s.kind}@${s.atSec}`)).toEqual([
      'chapter@0',
      'chapter@95',
      'checkpoint@100',
      'checkpoint@120',
      'checkpoint@150',
    ]);
    const flash = listed.suggestions.find((s) => s.atSec === 100)!;
    expect(flash.data).toEqual({
      kind: 'vocab_flash',
      ar: 'اِسْم',
      de: 'Name',
      contentRef: 'v-ism',
    });

    // Learners see nothing yet.
    const before = (await (
      await call('GET', '/interactive', undefined, 'student')
    ).json()) as {
      checkpoints: unknown[];
      chapters: unknown[];
    };
    expect(before).toMatchObject({ checkpoints: [], chapters: [] });

    const byAt = (at: number) => listed.suggestions.find((s) => s.atSec === at)!.id;
    expect(
      (await call('PUT', `/suggestions/${byAt(95)}`, { decision: 'accept' })).status
    ).toBe(204);
    expect(
      (await call('PUT', `/suggestions/${byAt(120)}`, { decision: 'accept' })).status
    ).toBe(204);
    expect(
      (await call('PUT', `/suggestions/${byAt(150)}`, { decision: 'dismiss' })).status
    ).toBe(204);
    expect(
      (await call('PUT', `/suggestions/${byAt(150)}`, { decision: 'accept' })).status
    ).toBe(404);

    const after = (await (
      await call('GET', '/interactive', undefined, 'student')
    ).json()) as {
      checkpoints: { atSec: number; data: { kind: string } }[];
      chapters: { id: string; atSec: number; title: string }[];
      canSuggest: boolean;
    };
    expect(after.chapters.map((c) => c.title)).toEqual(['Neue Wörter: Schule']);
    expect(after.checkpoints.map((c) => [c.atSec, c.data.kind])).toEqual([[120, 'mcq']]);
    expect(after.canSuggest).toBe(false);
    const remaining = (await (await call('GET', '/suggestions')).json()) as {
      suggestions: unknown[];
    };
    expect(remaining.suggestions).toHaveLength(2);

    expect((await call('DELETE', `/chapters/${after.chapters[0]!.id}`)).status).toBe(204);
    const usage = await pool.query(
      'select turns from ai_usage_daily where user_id = $1',
      [TEACHER]
    );
    expect(usage.rows).toEqual([{ turns: 1 }]);
  });

  it('keeps suggestions to the class teacher and respects the AI switch', async () => {
    expect((await call('POST', '/suggestions', undefined, 'student')).status).toBe(403);
    expect((await call('GET', '/suggestions', undefined, 'student')).status).toBe(403);
    await pool.query('update classes set ai_enabled = false');
    expect((await call('POST', '/suggestions')).status).toBe(409);
  });

  it('marks a run failed when the model answers nonsense or the class switched AI off', async () => {
    model.reply = 'no json';
    expect((await call('POST', '/suggestions')).status).toBe(202);
    await run();
    let listed = (await (await call('GET', '/suggestions')).json()) as {
      run: { status: string };
    };
    expect(listed.run.status).toBe('failed');

    model.reply = JSON.stringify(PROPOSAL);
    expect((await call('POST', '/suggestions')).status).toBe(202);
    await pool.query('update classes set ai_enabled = false');
    await run();
    listed = (await (await call('GET', '/suggestions')).json()) as {
      run: { status: string; error: string };
    };
    expect(listed.run).toMatchObject({
      status: 'failed',
      error: 'AI is switched off for this class',
    });
  });
});
