/**
 * Live class quiz (story 14.4), mounted at /api/v1:
 *
 *   GET  /classes/:id/quiz            → the caller's view, or { quiz: null }     (class:read)
 *   GET  /classes/:id/quiz/events     → SSE: `state` with the view on every change (class:read)
 *   POST /classes/:id/quiz            { count? } → 201 lobby                     (class:manage)
 *   POST /classes/:id/quiz/next       → first / next question, or the end        (class:manage)
 *   POST /classes/:id/quiz/reveal     → show the answer and the top five         (class:manage)
 *   POST /classes/:id/quiz/finish     → end early                                (class:manage)
 *   POST /classes/:id/quiz/join       → take part                                (class:read)
 *   POST /classes/:id/quiz/answer     { question, choice } → 204                 (class:read)
 *
 * The event stream polls a cheap version marker (one indexed query per second and client);
 * 30 learners are 30 small queries a second, well within one API instance.
 */
import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv, type AuthorizeLog } from '../authz/middleware.js';
import type { Actor as PolicyActor } from '../authz/policies.js';
import { MAX_QUESTIONS } from './quiz.js';
import type { LiveQuizRepository, QuizActionResult } from './quizRepository.js';
import type { ClassRepository } from './repository.js';

export interface QuizRouteDeps {
  classes: Pick<ClassRepository, 'scope'>;
  quiz: LiveQuizRepository;
  auth: AuthResolver;
  log: AuthorizeLog;
  /** How often event streams look for changes (ms). */
  pollMs?: number;
  /** A comment line keeps idle streams open through proxies (ms). */
  heartbeatMs?: number;
}

const Uuid = z.string().uuid();
const CreateBody = z
  .object({ count: z.number().int().min(1).max(MAX_QUESTIONS).optional() })
  .strict();
const AnswerBody = z
  .object({
    question: z.number().int().min(0).max(MAX_QUESTIONS),
    choice: z.number().int().min(0).max(9),
  })
  .strict();

const STATUS: Record<Exclude<QuizActionResult, { ok: true }>['reason'], 404 | 409> = {
  no_quiz: 404,
  wrong_state: 409,
  too_late: 409,
  not_joined: 409,
  running: 409,
};

export function createQuizRoutes(deps: QuizRouteDeps): Hono<ActorEnv> {
  const app = new Hono<ActorEnv>();
  const pollMs = deps.pollMs ?? 1000;
  const heartbeatMs = deps.heartbeatMs ?? 15_000;
  const classScope = async (c: Context, actor: PolicyActor) => {
    const id = Uuid.safeParse(c.req.param('id'));
    return id.success ? deps.classes.scope(id.data, actor.id) : { classRole: null };
  };
  const manage = authorize(deps.auth, 'class:manage', deps.log, classScope);
  const read = authorize(deps.auth, 'class:read', deps.log, classScope);

  /** Teachers of the class and admins see the answers and are not players. */
  const isTeacher = async (c: Context<ActorEnv>) => {
    const actor = c.get('actor');
    if (actor.role === 'admin') return true;
    const scope = await deps.classes.scope(c.req.param('id')!, actor.id);
    return scope.classRole === 'teacher';
  };
  const reply = (c: Context, result: QuizActionResult) =>
    result.ok
      ? c.body(null, 204)
      : c.json({ error: result.reason }, STATUS[result.reason]);
  const body = (c: Context) => c.req.json().catch(() => null);

  app.get('/classes/:id/quiz', read, async (c) => {
    c.header('Cache-Control', 'no-store');
    const quiz = await deps.quiz.view(
      c.req.param('id'),
      c.get('actor').id,
      await isTeacher(c)
    );
    return c.json({ quiz });
  });

  app.get('/classes/:id/quiz/events', read, async (c) => {
    const classId = c.req.param('id');
    const callerId = c.get('actor').id;
    const teacher = await isTeacher(c);
    c.header('Cache-Control', 'no-store');
    c.header('X-Accel-Buffering', 'no');
    return streamSSE(c, async (stream) => {
      let closed = false;
      stream.onAbort(() => {
        closed = true;
      });
      let seen: string | null | undefined;
      let quiet = 0;
      while (!closed) {
        const version = await deps.quiz.version(classId);
        if (version !== seen) {
          seen = version;
          quiet = 0;
          const quiz = await deps.quiz.view(classId, callerId, teacher);
          await stream.writeSSE({ event: 'state', data: JSON.stringify({ quiz }) });
        } else if ((quiet += pollMs) >= heartbeatMs) {
          quiet = 0;
          await stream.write(': keep-alive\n\n');
        }
        await stream.sleep(pollMs);
      }
    });
  });

  app.post('/classes/:id/quiz', manage, async (c) => {
    const parsed = CreateBody.safeParse((await body(c)) ?? {});
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const result = await deps.quiz.create(
      c.req.param('id'),
      c.get('actor').id,
      parsed.data.count
    );
    if (!result.ok) return c.json({ error: result.reason }, 409);
    return c.json({ id: result.id }, 201);
  });

  app.post('/classes/:id/quiz/next', manage, async (c) =>
    reply(c, await deps.quiz.next(c.req.param('id')))
  );
  app.post('/classes/:id/quiz/reveal', manage, async (c) =>
    reply(c, await deps.quiz.reveal(c.req.param('id')))
  );
  app.post('/classes/:id/quiz/finish', manage, async (c) =>
    reply(c, await deps.quiz.finish(c.req.param('id')))
  );

  app.post('/classes/:id/quiz/join', read, async (c) => {
    if (await isTeacher(c)) return c.json({ error: 'teacher' }, 409);
    return reply(c, await deps.quiz.join(c.req.param('id'), c.get('actor').id));
  });

  app.post('/classes/:id/quiz/answer', read, async (c) => {
    const parsed = AnswerBody.safeParse(await body(c));
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    return reply(
      c,
      await deps.quiz.answer(
        c.req.param('id'),
        c.get('actor').id,
        parsed.data.question,
        parsed.data.choice
      )
    );
  });

  return app;
}
