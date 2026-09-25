/**
 * Live class quiz (story 14.4) against Postgres, with 30 learners at once: joining, answering
 * in parallel, scores, the teacher's controls, who may do what, and the event streams that
 * push every change to all phones.
 */
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthResolver } from '../src/auth/resolver.js';
import type { Role } from '../src/authz/policies.js';
import type { QuizWord } from '../src/classes/quiz.js';
import { PgLiveQuizRepository, type QuizView } from '../src/classes/quizRepository.js';
import { PgClassRepository } from '../src/classes/repository.js';
import { pruneQuizzes } from '../src/jobs/maintenance.js';
import { loadMigrations, migrate } from '../src/migrate.js';

const url = process.env.SUFFA_TEST_DATABASE_URL;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };
const LEARNERS = 30;
const WORDS: QuizWord[] = Array.from({ length: 12 }, (_, i) => ({
  id: `w${i}`,
  ar: `كلمة${i}`,
  de: `Wort ${i}`,
  unit: 1,
}));

describe.skipIf(!url)('Live class quiz (Postgres, 30 learners)', () => {
  let pool: pg.Pool;
  let app: ReturnType<typeof createApp>;
  let classId: string;
  let now = new Date('2026-09-25T10:00:00.000Z');
  const users: Record<string, { id: string; role: Role }> = {};
  const learners = Array.from({ length: LEARNERS }, (_, i) => `learner${i}`);

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 10 });
    await pool.query('drop schema public cascade; create schema public');
    await migrate(
      pool,
      await loadMigrations(join(import.meta.dirname, '..', 'migrations')),
      quiet
    );
    const auth: AuthResolver = {
      actor: async (h) => users[h.get('x-test-user') ?? ''] ?? null,
    };
    app = createApp({
      version: 'test',
      expectedRevision: null,
      health: {
        schemaRevision: async () => null,
        queueDepth: async () => ({ waiting: 0, active: 0, failed: 0, deadLetter: 0 }),
      },
      quiz: {
        classes: new PgClassRepository(pool),
        quiz: new PgLiveQuizRepository(
          pool,
          WORDS,
          () => now,
          () => 0
        ),
        auth,
        log: quiet,
        pollMs: 20,
      },
    });
  });

  beforeEach(async () => {
    now = new Date('2026-09-25T10:00:00.000Z');
    await pool.query('truncate users, classes cascade');
    classId = randomUUID();
    await pool.query("insert into classes (id, name) values ($1, 'Arabisch 1a')", [
      classId,
    ]);
    const add = async (name: string, role: Role, classRole: string | null) => {
      const id = randomUUID();
      await pool.query(
        'insert into users (id, email, name, role) values ($1, $2, $3, $4)',
        [id, `${name}@example.org`, name, role]
      );
      users[name] = { id, role };
      if (classRole) {
        await pool.query(
          `insert into class_members (class_id, user_id, class_role, status)
           values ($1, $2, $3, 'active')`,
          [classId, id, classRole]
        );
      }
    };
    await add('teacher', 'teacher', 'teacher');
    await add('outsider', 'student', null);
    for (const l of learners) await add(l, 'student', 'student');
    // w7 is a leech for most learners: it must come first.
    for (const l of learners.slice(0, 20)) {
      await pool.query(
        `insert into srs_cards (user_id, id, "contentRef", kind, interval, ease, reps, lapses,
                                due, "lastReviewed", leech, updated_at, deleted)
         values ($1, 'vocab_ar_de:w7', 'w7', 'vocab_ar_de', 1, 1.3, 9, 8, now(), now(),
                 true, now(), false)`,
        [users[l]!.id]
      );
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  const call = (who: string, method: string, path: string, body?: unknown) =>
    app.request(`/api/v1/classes/${classId}/quiz${path}`, {
      method,
      headers: { 'x-test-user': who, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const view = async (who: string) =>
    ((await (await call(who, 'GET', '')).json()) as { quiz: QuizView | null }).quiz!;

  /** Opens an event stream and returns a reader for its `state` events. */
  const subscribe = async (who: string) => {
    const response = await call(who, 'GET', '/events');
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    return {
      async next(): Promise<QuizView | null> {
        for (;;) {
          const end = buffer.indexOf('\n\n');
          if (end >= 0) {
            const block = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const data = block
              .split('\n')
              .find((l) => l.startsWith('data:'))
              ?.slice(5)
              .trim();
            if (data) return (JSON.parse(data) as { quiz: QuizView | null }).quiz;
            continue;
          }
          const { value, done } = await reader.read();
          if (done) throw new Error('stream ended');
          buffer += decoder.decode(value, { stream: true });
        }
      },
      close: () => reader.cancel(),
    };
  };

  it('runs a quiz for 30 learners answering at once', async () => {
    expect((await call('teacher', 'POST', '', { count: 3 })).status).toBe(201);
    // One running quiz per class.
    expect((await call('teacher', 'POST', '', {})).status).toBe(409);

    await Promise.all(learners.map((l) => call(l, 'POST', '/join')));
    const lobby = await view('teacher');
    expect(lobby).toMatchObject({ status: 'lobby', players: LEARNERS, questionCount: 3 });
    expect(lobby.question).toBeNull();

    const streams = await Promise.all(learners.map((l) => subscribe(l)));
    for (const s of streams) expect((await s.next())?.status).toBe('lobby');

    expect((await call('teacher', 'POST', '/next')).status).toBe(204);
    const opened = await Promise.all(streams.map((s) => s.next()));
    expect(opened.every((v) => v?.status === 'question')).toBe(true);
    const question = opened[0]!.question!;
    expect(question.wordId).toBe('w7');
    expect(question.correct).toBeNull();
    const correct = (await view('teacher')).question!.correct!;

    // Half answer right after 2 s, half wrong; everybody at the same moment.
    now = new Date(now.getTime() + 2000);
    const results = await Promise.all(
      learners.map((l, i) =>
        call(l, 'POST', '/answer', {
          question: 0,
          choice: i % 2 === 0 ? correct : (correct + 1) % 4,
        })
      )
    );
    expect(results.every((r) => r.status === 204)).toBe(true);
    // A second answer does not count; outsiders and late answers are refused.
    await call('learner1', 'POST', '/answer', { question: 0, choice: correct });
    expect(
      (await call('outsider', 'POST', '/answer', { question: 0, choice: 0 })).status
    ).toBe(403);
    expect((await view('teacher')).answered).toBe(LEARNERS);

    expect((await call('teacher', 'POST', '/reveal')).status).toBe(204);
    const mine = await view('learner0');
    expect(mine.question?.correct).toBe(correct);
    expect(mine.question?.distribution?.reduce((a, b) => a + b, 0)).toBe(LEARNERS);
    expect(mine.you).toMatchObject({ points: 950, answer: { correct: true } });
    expect((await view('learner1')).you).toMatchObject({
      points: 0,
      answer: { correct: false },
    });
    expect(mine.leaderboard).toHaveLength(5);
    expect(mine.leaderboard.every((e) => e.points === 950)).toBe(true);

    // Every phone learns about the reveal through its stream.
    const revealed = await Promise.all(
      streams.map(async (s) => {
        let v = await s.next();
        while (v?.status !== 'reveal') v = await s.next();
        return v;
      })
    );
    expect(revealed.every((v) => v.question?.correct === correct)).toBe(true);
    await Promise.all(streams.map((s) => s.close()));

    // Too late after 20 s; then through to the end.
    await call('teacher', 'POST', '/next');
    now = new Date(now.getTime() + 21_000);
    expect(
      (await call('learner0', 'POST', '/answer', { question: 1, choice: 0 })).status
    ).toBe(409);
    await call('teacher', 'POST', '/reveal');
    await call('teacher', 'POST', '/next');
    await call('teacher', 'POST', '/reveal');
    await call('teacher', 'POST', '/next');
    const end = await view('learner0');
    expect(end.status).toBe('finished');
    expect(end.leaderboard[0]).toMatchObject({ points: 950 });
    // A new quiz may start once the last one is finished.
    expect((await call('teacher', 'POST', '', { count: 2 })).status).toBe(201);
  });

  it('keeps the controls with the teacher and the game with the learners', async () => {
    expect((await call('learner0', 'POST', '')).status).toBe(403);
    expect((await call('teacher', 'POST', '/next')).status).toBe(404);
    await call('teacher', 'POST', '', { count: 2 });
    expect((await call('learner0', 'POST', '/next')).status).toBe(403);
    expect((await call('teacher', 'POST', '/join')).status).toBe(409);
    expect((await call('outsider', 'GET', '')).status).toBe(403);
    // Reveal only while a question is open; answers only from players.
    expect((await call('teacher', 'POST', '/reveal')).status).toBe(409);
    await call('teacher', 'POST', '/next');
    expect(
      (await call('learner0', 'POST', '/answer', { question: 0, choice: 0 })).status
    ).toBe(409);
    // The teacher sees the answer before it is revealed; learners do not.
    expect((await view('teacher')).question?.correct).not.toBeNull();
    expect((await view('learner0')).question?.correct).toBeNull();
    expect((await call('teacher', 'POST', '/finish')).status).toBe(204);
    expect((await view('learner0')).status).toBe('finished');
  });

  it('ends abandoned quizzes and deletes old results with the maintenance job', async () => {
    await call('teacher', 'POST', '', { count: 2 });
    await pool.query(
      "update live_quizzes set created_at = now() - interval '13 hours' where class_id = $1",
      [classId]
    );
    expect(await pruneQuizzes(pool)).toEqual({ ended: 1, removed: 0 });
    await pool.query(
      "update live_quizzes set finished_at = now() - interval '31 days' where class_id = $1",
      [classId]
    );
    expect(await pruneQuizzes(pool)).toEqual({ ended: 0, removed: 1 });
    const left = await pool.query('select count(*)::int as n from live_quizzes');
    expect(left.rows[0].n).toBe(0);
  });
});
