/**
 * al-Muʿallim end to end against Postgres (stories 10.1, 10.2, 10.4): an SSE turn with a tool
 * call, one counted turn, stored messages, ratings, the repair retry, and no way to reach
 * another learner's conversations or recordings. Run with SUFFA_TEST_DATABASE_URL.
 */
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  ModelRouter,
  type LlmProvider,
  type LlmRequest,
  type LlmResult,
  type ToolCall,
} from '@suffa/llm';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AiGateway } from '../src/ai/gateway.js';
import { PgAiRepository } from '../src/ai/repository.js';
import { createApp } from '../src/app.js';
import type { AuthResolver } from '../src/auth/resolver.js';
import { loadMigrations, migrate } from '../src/migrate.js';
import { ContentCatalog } from '../src/tutor/content.js';
import { PgLearnerState } from '../src/tutor/learner.js';
import { PgClassRepository } from '../src/classes/repository.js';
import { GradeService, PgGradeRepository } from '../src/tutor/grading.js';
import { PgTutorRepository } from '../src/tutor/repository.js';
import { PgReviewRepository } from '../src/tutor/review.js';
import { PgTutorSettings } from '../src/tutor/routes.js';
import { TutorService, type TutorEvent } from '../src/tutor/service.js';
import type { MediaAccess } from '../src/tutor/tools.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };
const AMINA = '00000000-0000-4000-8000-00000000000a';
const BILAL = '00000000-0000-4000-8000-00000000000b';
const TEACHER = '00000000-0000-4000-8000-00000000000c';
const OTHER_TEACHER = '00000000-0000-4000-8000-00000000000d';
const CLASS = '11111111-1111-4111-8111-111111111111';
const OTHER_CLASS = '11111111-1111-4111-8111-222222222222';

const RUBRIC = {
  score: 72,
  rubric: { task: 3, grammar: 2, vocabulary: 3, spelling: 5 },
  summary: 'Gut verständlich! Achte auf das Genus.',
  corrected: 'هٰذِهِ مَدْرَسَةٌ كَبيرَةٌ. أَنا أُحِبُّ الْكِتابَ.',
  mistakes: [
    {
      original: 'هذا مدرسة',
      correction: 'هٰذِهِ مَدْرَسَةٌ',
      category: 'grammar',
      explanation: 'مدرسة ist feminin, also هٰذِهِ.',
    },
    {
      original: 'الكتب',
      correction: 'الْكِتابَ',
      category: 'vocabulary',
      explanation: 'Gemeint ist das eine Buch.',
    },
  ],
};
const CONTENT = fileURLToPath(new URL('../../web/src/content', import.meta.url));

type Step = { text: string; toolCalls?: ToolCall[] };

/** Plays scripted model turns and records every request. */
class ScriptedModel implements LlmProvider {
  readonly id = 'anthropic' as const;
  requests: LlmRequest[] = [];
  constructor(public steps: Step[]) {}
  private next(request: LlmRequest): LlmResult {
    this.requests.push(structuredClone({ ...request, signal: undefined }));
    const step = this.steps.shift() ?? { text: 'مَرْحَبًا!' };
    return {
      provider: 'anthropic',
      model: request.model,
      text: step.text,
      stopReason: step.toolCalls ? 'tool_use' : 'end',
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 3000,
        cacheWriteTokens: 0,
      },
      toolCalls: step.toolCalls ?? [],
      replay: { provider: 'anthropic', content: [{ type: 'text', text: step.text }] },
    };
  }
  async complete(request: LlmRequest) {
    return this.next(request);
  }
  async *stream(request: LlmRequest) {
    const result = this.next(request);
    if (result.text) yield { type: 'text' as const, text: result.text };
    yield { type: 'done' as const, result };
  }
}

async function readSse(response: Response): Promise<TutorEvent[]> {
  const text = await response.text();
  return text
    .split('\n\n')
    .map((block) => block.split('\n').find((l) => l.startsWith('data:')))
    .filter((l): l is string => Boolean(l))
    .map((l) => JSON.parse(l.slice(5).trim()) as TutorEvent);
}

describe.skipIf(!url)('al-Muʿallim (Postgres)', () => {
  let pool: pg.Pool;
  let catalog: ContentCatalog;
  let model: ScriptedModel;
  let app: ReturnType<typeof createApp>;
  const mediaAsks: string[] = [];

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    await pool.query('drop schema public cascade; create schema public');
    await migrate(
      pool,
      await loadMigrations(join(import.meta.dirname, '..', 'migrations')),
      quiet
    );
    catalog = await ContentCatalog.load(CONTENT);
  });

  beforeEach(async () => {
    await pool.query(
      'truncate ai_calls, ai_usage_daily, ai_spend_monthly, ai_conversations, ai_grades, classes cascade'
    );
    await pool.query('delete from users');
    await pool.query(
      `insert into users (id, email, name, role, time_zone) values
         ($1, 'amina@example.org', 'Amina Yilmaz', 'student', 'Europe/Zurich'),
         ($2, 'bilal@example.org', 'Bilal', 'student', 'Europe/Zurich'),
         ($3, 'lehrerin@example.org', 'Frau Demir', 'teacher', 'Europe/Zurich'),
         ($4, 'lehrer2@example.org', 'Herr Ali', 'teacher', 'Europe/Zurich')`,
      [AMINA, BILAL, TEACHER, OTHER_TEACHER]
    );
    await pool.query(
      `insert into classes (id, name, created_by) values ($1, 'Arabisch 1a', $3), ($2, 'Arabisch 2b', $4)`,
      [CLASS, OTHER_CLASS, TEACHER, OTHER_TEACHER]
    );
    await pool.query(
      `insert into class_members (class_id, user_id, class_role, status) values
         ($1, $3, 'teacher', 'active'), ($1, $4, 'student', 'active'),
         ($2, $5, 'teacher', 'active')`,
      [CLASS, OTHER_CLASS, TEACHER, AMINA, OTHER_TEACHER]
    );
    await pool.query(
      `insert into unit_enrollments (user_id, id, book, unit, pace, "startedAt", "dueAt", updated_at)
       values ($1, 'b1-u3', 1, 3, 'normal', now(), now() + interval '14 days', now())`,
      [AMINA]
    );
    await pool.query(
      `insert into srs_cards (user_id, id, "contentRef", kind, due, leech, lapses, updated_at)
       values ($1, 'vocab_ar_de:v-ism', 'v-ism', 'vocab_ar_de', now() - interval '1 day', true, 5, now())`,
      [AMINA]
    );
    model = new ScriptedModel([]);
    const repo = new PgAiRepository(pool);
    const router = new ModelRouter({ providers: { anthropic: model }, source: repo });
    const gateway = new AiGateway({ router, repo, log: quiet });
    const tutorRepo = new PgTutorRepository(pool);
    const grades = new PgGradeRepository(pool);
    const media: MediaAccess = {
      segment: async (actor, mediaId) => {
        mediaAsks.push(`${actor.id}:${mediaId}`);
        return 'forbidden';
      },
    };
    const auth: AuthResolver = {
      actor: async (h) => {
        const who = h.get('x-test-user');
        const users: Record<string, { id: string; role: 'student' | 'teacher' }> = {
          amina: { id: AMINA, role: 'student' },
          bilal: { id: BILAL, role: 'student' },
          teacher: { id: TEACHER, role: 'teacher' },
          other: { id: OTHER_TEACHER, role: 'teacher' },
        };
        return users[who ?? ''] ?? null;
      },
    };
    app = createApp({
      version: 'test',
      expectedRevision: null,
      health: {
        schemaRevision: async () => null,
        queueDepth: async () => ({ waiting: 0, active: 0, failed: 0, deadLetter: 0 }),
      },
      tutor: {
        service: new TutorService({
          gateway,
          repo: tutorRepo,
          catalog,
          learner: new PgLearnerState(pool, catalog),
          media,
          log: quiet,
        }),
        repo: tutorRepo,
        settings: new PgTutorSettings(pool),
        available: async () => true,
        grading: {
          service: new GradeService({
            gateway,
            repo: grades,
            catalog,
            learner: new PgLearnerState(pool, catalog),
          }),
          repo: grades,
        },
        auth,
        log: quiet,
      },
      reviews: {
        classes: new PgClassRepository(pool),
        reviews: new PgReviewRepository(pool),
        auth,
        log: quiet,
      },
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  const call = (method: string, path: string, body?: unknown, user = 'amina') =>
    app.request(`/api/v1${path}`, {
      method,
      headers: { 'x-test-user': user, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  it('answers a turn with a tool call, grounded in unit and learner, counted once', async () => {
    model.steps = [
      {
        text: 'Ich schaue nach.',
        toolCalls: [{ id: 'toolu_1', name: 'lookup_vocab', input: { query: 'اسم' } }],
      },
      { text: 'اِسْمٌ heißt „Name“. Wie heißt du? ما اسْمُكَ؟' },
    ];
    const response = await call('POST', '/tutor/turn', { message: 'Was heißt اسم?' });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const events = await readSse(response);
    expect(events.map((e) => e.type)).toEqual([
      'start',
      'text',
      'tool',
      'text',
      'text',
      'done',
    ]);
    const text = events
      .filter((e) => e.type === 'text')
      .map((e) => (e as { text: string }).text);
    expect(text.join('')).toBe(
      'Ich schaue nach.\n\nاِسْمٌ heißt „Name“. Wie heißt du? ما اسْمُكَ؟'
    );

    // Grounding: persona + unit 3 pack (cached) + Amina's snapshot; tools offered.
    const first = model.requests[0]!;
    expect(first.system?.map((p) => Boolean(p.cache))).toEqual([true, true, false]);
    expect(first.system?.[1]?.text).toBe(catalog.pack(3));
    expect(first.system?.[2]?.text).toContain('First name: Amina');
    expect(first.system?.[2]?.text).not.toContain('Yilmaz');
    expect(first.system?.[2]?.text).toContain('Often forgotten: اسْم (Name)');
    expect(first.tools?.map((t) => t.name)).toContain('get_media_segment');
    // The tool result went back to the model, after the replayed assistant turn.
    const second = model.requests[1]!;
    expect(second.messages.at(-2)).toMatchObject({
      role: 'assistant',
      replay: { provider: 'anthropic' },
    });
    const tool = second.messages.at(-1) as {
      role: string;
      results: { content: string }[];
    };
    expect(tool.role).toBe('tool');
    expect(JSON.parse(tool.results[0]!.content)[0]).toMatchObject({ de: 'Name' });

    // Two model calls, one learner turn.
    const usage = await pool.query(
      'select turns from ai_usage_daily where user_id = $1',
      [AMINA]
    );
    expect(usage.rows).toEqual([{ turns: 1 }]);
    const calls = await pool.query('select count(*)::int as n from ai_calls');
    expect(calls.rows[0].n).toBe(2);

    // Stored: the question and the final answer the learner saw.
    const start = events[0] as { conversationId: string };
    const stored = (await (
      await call('GET', `/tutor/conversations/${start.conversationId}`)
    ).json()) as { messages: { role: string; content: string }[] };
    expect(stored.messages.map((m: { role: string }) => m.role)).toEqual([
      'user',
      'assistant',
    ]);
    expect(stored.messages[1].content).toContain('اِسْمٌ heißt');
    const overview = await (await call('GET', '/tutor')).json();
    expect(overview).toMatchObject({
      available: true,
      tutorLanguage: 'de',
      conversations: [{ id: start.conversationId, title: 'Was heißt اسم?' }],
    });
  });

  it('continues a conversation with its history and stores 👍/👎', async () => {
    model.steps = [{ text: 'أَهْلًا!' }, { text: 'جَيِّدٌ جِدًّا!' }];
    const first = await readSse(await call('POST', '/tutor/turn', { message: 'Hallo' }));
    const conversationId = (first[0] as { conversationId: string }).conversationId;
    await readSse(
      await call('POST', '/tutor/turn', { conversationId, message: 'أنا بخير' })
    );
    expect(model.requests[1]!.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
    const done = first.at(-1) as { messageId: string };
    expect(
      (await call('PUT', `/tutor/messages/${done.messageId}/rating`, { rating: 1 }))
        .status
    ).toBe(204);
    const rating = await pool.query('select rating from ai_messages where id = $1', [
      done.messageId,
    ]);
    expect(rating.rows[0].rating).toBe(1);
  });

  it('repairs an answer that fails validation, or falls back', async () => {
    model.steps = [
      { text: 'هذا كتاب جديد في البيت' },
      { text: 'هٰذا كِتابٌ جَديدٌ في الْبَيْتِ' },
    ];
    const events = await readSse(
      await call('POST', '/tutor/turn', { message: 'Satz bitte' })
    );
    expect(events.find((e) => e.type === 'replace')).toEqual({
      type: 'replace',
      text: 'هٰذا كِتابٌ جَديدٌ في الْبَيْتِ',
    });
    expect(events.at(-1)).toMatchObject({ type: 'done', flags: [] });
    expect(model.requests[1]!.messages.at(-1)).toMatchObject({ role: 'user' });

    model.steps = [{ text: 'Das ist haram.' }, { text: 'Musik ist haram.' }];
    const blocked = await readSse(
      await call('POST', '/tutor/turn', { message: 'Ist Musik erlaubt?' })
    );
    const replaced = blocked.find((e) => e.type === 'replace') as { text: string };
    expect(replaced.text).toContain('Lehrkraft');
    const stored = await pool.query(
      "select content, flags from ai_messages where role = 'assistant' order by created_at desc limit 1"
    );
    expect(stored.rows[0]).toEqual({ content: replaced.text, flags: ['ruling'] });
  });

  it('keeps every learner to their own conversations, ratings and recordings', async () => {
    model.steps = [{ text: 'أَهْلًا يا أَمينَة!' }];
    const events = await readSse(await call('POST', '/tutor/turn', { message: 'Hallo' }));
    const conversationId = (events[0] as { conversationId: string }).conversationId;
    const messageId = (events.at(-1) as { messageId: string }).messageId;

    expect(
      (await call('GET', `/tutor/conversations/${conversationId}`, undefined, 'bilal'))
        .status
    ).toBe(404);
    expect(
      (await call('DELETE', `/tutor/conversations/${conversationId}`, undefined, 'bilal'))
        .status
    ).toBe(404);
    expect(
      (await call('PUT', `/tutor/messages/${messageId}/rating`, { rating: -1 }, 'bilal'))
        .status
    ).toBe(404);
    const hijack = await readSse(
      await call(
        'POST',
        '/tutor/turn',
        { conversationId, message: 'Was stand da?' },
        'bilal'
      )
    );
    expect(hijack).toEqual([
      { type: 'error', error: 'not_found', message: 'Gespräch nicht gefunden.' },
    ]);
    expect(
      (
        (await (await call('GET', '/tutor', undefined, 'bilal')).json()) as {
          conversations: [];
        }
      ).conversations
    ).toEqual([]);

    // Bilal's model asks for Amina's state and a recording: tools use Bilal's session.
    model.steps = [
      {
        text: '',
        toolCalls: [
          { id: 't1', name: 'get_learner_state', input: { userId: AMINA } },
          {
            id: 't2',
            name: 'get_media_segment',
            input: { mediaId: '22222222-2222-4222-8222-222222222222', atSec: 10 },
          },
        ],
      },
      { text: 'Dazu habe ich nichts.' },
    ];
    await readSse(
      await call('POST', '/tutor/turn', { message: 'Zeig mir alles' }, 'bilal')
    );
    const results = (
      model.requests.at(-1)!.messages.at(-1) as {
        results: { content: string; isError?: boolean }[];
      }
    ).results;
    const state = JSON.parse(results[0]!.content);
    expect(state.cards.total).toBe(0); // Bilal's own (empty) progress, not Amina's
    expect(results[1]).toMatchObject({ isError: true });
    expect(mediaAsks.at(-1)).toBe(`${BILAL}:22222222-2222-4222-8222-222222222222`);

    // Amina deletes her conversation.
    expect((await call('DELETE', `/tutor/conversations/${conversationId}`)).status).toBe(
      204
    );
  });

  it('sets the tutoring language and validates input', async () => {
    expect((await call('PUT', '/tutor/settings', { tutorLanguage: 'en' })).status).toBe(
      204
    );
    const overview = (await (await call('GET', '/tutor')).json()) as {
      tutorLanguage: string;
    };
    expect(overview.tutorLanguage).toBe('en');
    model.steps = [{ text: 'Hello! مَرْحَبًا' }];
    await readSse(await call('POST', '/tutor/turn', { message: 'Hi' }));
    expect(model.requests[0]!.system?.[0]?.text).toContain('Explain in English');
    expect((await call('PUT', '/tutor/settings', { tutorLanguage: 'fr' })).status).toBe(
      400
    );
    expect((await call('POST', '/tutor/turn', { message: '' })).status).toBe(400);
    expect(
      (await call('POST', '/tutor/turn', { message: 'x', role: 'admin' })).status
    ).toBe(400);
    expect((await call('GET', '/tutor', undefined, '')).status).toBe(401);
  });

  it('streams the quota message when today’s turns are used up', async () => {
    await pool.query('update ai_settings set student_daily_turns = 0');
    const events = await readSse(await call('POST', '/tutor/turn', { message: 'Hallo' }));
    expect(events.at(-1)).toMatchObject({ type: 'error', error: 'ai_quota' });
    await pool.query('update ai_settings set student_daily_turns = 30');
  });

  it('grades a text with a rubric, links mistakes to course words and keeps it for the teacher', async () => {
    model.steps = [{ text: JSON.stringify(RUBRIC) }];
    const response = await call('POST', '/tutor/grade', {
      kind: 'writing',
      task: 'Beschreibe deine Schule.',
      answer: 'هذا مدرسة كبيرة. أنا أحب الكتب.',
    });
    expect(response.status).toBe(200);
    const grade = (await response.json()) as {
      id: string;
      score: number;
      rubric: Record<string, number>;
      mistakes: { wordId: string | null }[];
    };
    // Clamped into the rubric range; the article is ignored when matching the course word.
    expect(grade.score).toBe(72);
    expect(grade.rubric.spelling).toBe(4);
    expect(grade.mistakes.map((m) => m.wordId)).toEqual([null, 'v-kitab']);
    const request = model.requests.at(-1)!;
    expect(request.jsonSchema).toMatchObject({
      required: ['score', 'rubric', 'summary', 'corrected', 'mistakes'],
    });
    expect(request.system?.[0]?.text).toContain('The text was typed');
    const own = (await (await call('GET', '/tutor/grades')).json()) as {
      grades: { id: string }[];
    };
    expect(own.grades.map((g) => g.id)).toEqual([grade.id]);
    const usage = await pool.query(
      'select turns from ai_usage_daily where user_id = $1',
      [AMINA]
    );
    expect(usage.rows).toEqual([{ turns: 1 }]);

    // The class teacher sees it, overrides it; the export has no names.
    const queue = (await (
      await call('GET', `/classes/${CLASS}/grades`, undefined, 'teacher')
    ).json()) as {
      grades: { id: string; learner: string }[];
    };
    expect(queue.grades).toMatchObject([{ id: grade.id, learner: 'Amina Yilmaz' }]);
    expect(
      (
        await call(
          'PUT',
          `/classes/${CLASS}/grades/${grade.id}`,
          { decision: 'override', score: 60, comment: 'Zwei Genusfehler, nicht einer.' },
          'teacher'
        )
      ).status
    ).toBe(204);
    const open = (await (
      await call('GET', `/classes/${CLASS}/grades`, undefined, 'teacher')
    ).json()) as {
      grades: unknown[];
    };
    expect(open.grades).toEqual([]);
    const exported = await call(
      'GET',
      `/classes/${CLASS}/grades/export`,
      undefined,
      'teacher'
    );
    expect(exported.headers.get('content-disposition')).toContain('attachment');
    const cases = (await exported.json()) as { cases: Record<string, unknown>[] };
    expect(cases.cases).toEqual([
      {
        kind: 'writing',
        task: 'Beschreibe deine Schule.',
        answer: 'هذا مدرسة كبيرة. أنا أحب الكتب.',
        expectedScore: 60,
        modelScore: 72,
        teacherComment: 'Zwei Genusfehler, nicht einer.',
        corrected: null,
      },
    ]);
    expect(JSON.stringify(cases)).not.toContain('Amina');
  });

  it('keeps grades inside the class: other teachers and learners cannot see or judge them', async () => {
    model.steps = [{ text: JSON.stringify(RUBRIC) }];
    const grade = (await (
      await call('POST', '/tutor/grade', {
        kind: 'speech',
        task: '',
        answer: 'أنا من زيورخ',
      })
    ).json()) as { id: string };
    expect(model.requests.at(-1)!.system?.[0]?.text).toContain(
      'automatic transcript of speech'
    );
    expect(
      (await call('GET', `/classes/${CLASS}/grades`, undefined, 'other')).status
    ).toBe(403);
    expect(
      (await call('GET', `/classes/${CLASS}/grades`, undefined, 'amina')).status
    ).toBe(403);
    expect(
      (
        await call(
          'PUT',
          `/classes/${OTHER_CLASS}/grades/${grade.id}`,
          { decision: 'confirm' },
          'other'
        )
      ).status
    ).toBe(404);
    expect(
      (
        await call(
          'PUT',
          `/classes/${CLASS}/grades/${grade.id}`,
          { decision: 'nope' },
          'teacher'
        )
      ).status
    ).toBe(400);
    const bilal = (await (
      await call('GET', '/tutor/grades', undefined, 'bilal')
    ).json()) as {
      grades: unknown[];
    };
    expect(bilal.grades).toEqual([]);
  });

  it('answers a broken rubric and bad input calmly', async () => {
    model.steps = [{ text: 'Sorry, no JSON today.' }];
    const broken = await call('POST', '/tutor/grade', {
      kind: 'writing',
      answer: 'مرحبا',
    });
    expect(broken.status).toBe(503);
    expect(await broken.json()).toMatchObject({ error: 'ai_unavailable' });
    expect(
      (await call('POST', '/tutor/grade', { kind: 'essay', answer: 'x' })).status
    ).toBe(400);
    expect(
      (await call('POST', '/tutor/grade', { kind: 'writing', answer: '' })).status
    ).toBe(400);
  });
});
