/**
 * Live class quiz in Postgres (story 14.4). The quiz row carries the whole state (status,
 * current question, questions with answers); every change bumps `version`, which the event
 * streams poll. Transitions lock the row, so a double click on "weiter" moves only once.
 */
import { randomInt, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { inTransaction } from '../db/transaction.js';
import {
  answerPoints,
  buildQuestions,
  DEFAULT_QUESTIONS,
  leaderboard,
  nextStep,
  QUESTION_SECONDS,
  type QuizQuestion,
  type QuizStatus,
  type QuizWord,
  type Random,
} from './quiz.js';

/** Leech words considered for a quiz. */
const LEECH_CANDIDATES = 30;
/** A finished quiz stays visible (results) for this long. */
const FINISHED_VISIBLE_MS = 30 * 60_000;

export interface QuizView {
  id: string;
  status: QuizStatus;
  questionCount: number;
  current: number;
  questionSeconds: number;
  /** Server time the current question opened (ISO), for the countdown. */
  questionStartedAt: string | null;
  players: number;
  /** Answers given to the current question. */
  answered: number;
  question: {
    index: number;
    wordId: string;
    prompt: string;
    options: string[];
    /** Only once revealed (or for the teacher). */
    correct: number | null;
    /** Answers per option, once revealed. */
    distribution: number[] | null;
  } | null;
  /** The learner's own part; null for the teacher. */
  you: {
    joined: boolean;
    points: number;
    answer: { choice: number; correct: boolean | null } | null;
  } | null;
  /** Top five, once a question is revealed and at the end. */
  leaderboard: { name: string; points: number; you: boolean }[];
}

export type QuizActionResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'no_quiz' | 'wrong_state' | 'too_late' | 'not_joined' | 'running';
    };

export interface LiveQuizRepository {
  create(
    classId: string,
    actorId: string,
    count?: number
  ): Promise<{ ok: true; id: string } | { ok: false; reason: 'running' | 'no_words' }>;
  next(classId: string): Promise<QuizActionResult>;
  reveal(classId: string): Promise<QuizActionResult>;
  finish(classId: string): Promise<QuizActionResult>;
  join(classId: string, userId: string): Promise<QuizActionResult>;
  answer(
    classId: string,
    userId: string,
    question: number,
    choice: number
  ): Promise<QuizActionResult>;
  view(classId: string, callerId: string, teacher: boolean): Promise<QuizView | null>;
  /** Cheap change marker for event streams: quiz id and version, or null. */
  version(classId: string): Promise<string | null>;
}

interface QuizRow {
  id: string;
  status: QuizStatus;
  questions: QuizQuestion[];
  current: number;
  question_started_at: Date | null;
  version: number;
}

export class PgLiveQuizRepository implements LiveQuizRepository {
  constructor(
    private readonly pool: pg.Pool,
    private readonly words: readonly QuizWord[],
    private readonly now: () => Date = () => new Date(),
    private readonly random: Random = (n) => randomInt(n)
  ) {}

  /** The running quiz, or the last one finished recently (to show its results). */
  private async current(
    db: pg.Pool | pg.PoolClient,
    classId: string,
    lock = false
  ): Promise<QuizRow | null> {
    const { rows } = await db.query<QuizRow>(
      `select id, status, questions, current, question_started_at, version
         from live_quizzes
        where class_id = $1
          and (status <> 'finished' or finished_at > $2::timestamptz - $3 * interval '1 millisecond')
        order by created_at desc limit 1 ${lock ? 'for update' : ''}`,
      [classId, this.now(), FINISHED_VISIBLE_MS]
    );
    return rows[0] ?? null;
  }

  async create(classId: string, actorId: string, count = DEFAULT_QUESTIONS) {
    const [leeches, units] = await Promise.all([
      this.pool.query<{ ref: string }>(
        `select c."contentRef" as ref
           from srs_cards c
           join class_members m on m.user_id = c.user_id
          where m.class_id = $1 and m.status = 'active' and m.class_role = 'student'
            and c.leech and not c.deleted
          group by c."contentRef"
          order by count(distinct c.user_id) desc, c."contentRef"
          limit $2`,
        [classId, LEECH_CANDIDATES]
      ),
      this.pool.query<{ unit: number | null }>(
        `select max(e.unit) as unit
           from unit_enrollments e
           join class_members m on m.user_id = e.user_id
          where m.class_id = $1 and m.status = 'active' and m.class_role = 'student'
            and not e.deleted`,
        [classId]
      ),
    ]);
    // Top up from the units the class has reached (at least unit 1).
    const reached = Math.max(1, units.rows[0]?.unit ?? 1);
    const fill = Array.from({ length: reached }, (_, i) => i + 1);
    const questions = buildQuestions(
      this.words,
      leeches.rows.map((r) => r.ref),
      fill,
      count,
      this.random
    );
    if (questions.length === 0) return { ok: false, reason: 'no_words' } as const;
    const id = randomUUID();
    try {
      await this.pool.query(
        `insert into live_quizzes (id, class_id, created_by, status, questions, created_at)
         values ($1, $2, $3, 'lobby', $4::jsonb, $5)`,
        [id, classId, actorId, JSON.stringify(questions), this.now()]
      );
    } catch (error) {
      // The partial unique index: another quiz of this class is still running.
      if ((error as { code?: string }).code === '23505') {
        return { ok: false, reason: 'running' } as const;
      }
      throw error;
    }
    return { ok: true, id } as const;
  }

  private async transition(
    classId: string,
    step: (quiz: QuizRow) => { status: QuizStatus; current: number } | null
  ): Promise<QuizActionResult> {
    return inTransaction(this.pool, async (db) => {
      const quiz = await this.current(db, classId, true);
      if (!quiz || quiz.status === 'finished') return { ok: false, reason: 'no_quiz' };
      const target = step(quiz);
      if (!target) return { ok: false, reason: 'wrong_state' };
      await db.query(
        `update live_quizzes
            set status = $2, current = $3, version = version + 1,
                question_started_at = case when $2 = 'question' then $4::timestamptz
                                           else question_started_at end,
                finished_at = case when $2 = 'finished' then $4::timestamptz end
          where id = $1`,
        [quiz.id, target.status, target.current, this.now()]
      );
      return { ok: true };
    });
  }

  next(classId: string) {
    return this.transition(classId, (q) =>
      nextStep(q.status, q.current, q.questions.length)
    );
  }

  reveal(classId: string) {
    return this.transition(classId, (q) =>
      q.status === 'question' ? { status: 'reveal', current: q.current } : null
    );
  }

  finish(classId: string) {
    return this.transition(classId, (q) => ({ status: 'finished', current: q.current }));
  }

  async join(classId: string, userId: string): Promise<QuizActionResult> {
    const quiz = await this.current(this.pool, classId);
    if (!quiz || quiz.status === 'finished') return { ok: false, reason: 'no_quiz' };
    const { rowCount } = await this.pool.query(
      `insert into live_quiz_players (quiz_id, user_id, joined_at) values ($1, $2, $3)
       on conflict do nothing`,
      [quiz.id, userId, this.now()]
    );
    if (rowCount) await this.bump(quiz.id);
    return { ok: true };
  }

  async answer(
    classId: string,
    userId: string,
    question: number,
    choice: number
  ): Promise<QuizActionResult> {
    const quiz = await this.current(this.pool, classId);
    if (!quiz || quiz.status === 'finished') return { ok: false, reason: 'no_quiz' };
    if (quiz.status !== 'question' || quiz.current !== question) {
      return { ok: false, reason: 'wrong_state' };
    }
    const q = quiz.questions[question]!;
    if (choice < 0 || choice >= q.options.length)
      return { ok: false, reason: 'wrong_state' };
    const now = this.now();
    const elapsed =
      now.getTime() - (quiz.question_started_at?.getTime() ?? now.getTime());
    if (elapsed > QUESTION_SECONDS * 1000) return { ok: false, reason: 'too_late' };
    const correct = choice === q.correct;
    // Only players can answer; the first answer counts.
    const { rowCount } = await this.pool.query(
      `insert into live_quiz_answers (quiz_id, user_id, question, choice, correct, points,
                                      answered_at)
       select $1, $2, $3, $4, $5, $6, $7
        where exists (select 1 from live_quiz_players where quiz_id = $1 and user_id = $2)
       on conflict do nothing`,
      [quiz.id, userId, question, choice, correct, answerPoints(correct, elapsed), now]
    );
    if (!rowCount) {
      const joined = await this.pool.query(
        'select 1 from live_quiz_players where quiz_id = $1 and user_id = $2',
        [quiz.id, userId]
      );
      if (joined.rowCount === 0) return { ok: false, reason: 'not_joined' };
      return { ok: true };
    }
    await this.bump(quiz.id);
    return { ok: true };
  }

  private async bump(quizId: string) {
    await this.pool.query('update live_quizzes set version = version + 1 where id = $1', [
      quizId,
    ]);
  }

  async version(classId: string): Promise<string | null> {
    const quiz = await this.current(this.pool, classId);
    return quiz ? `${quiz.id}:${quiz.version}` : null;
  }

  async view(
    classId: string,
    callerId: string,
    teacher: boolean
  ): Promise<QuizView | null> {
    const quiz = await this.current(this.pool, classId);
    if (!quiz) return null;
    const [players, answers] = await Promise.all([
      this.pool.query<{ user_id: string; name: string | null }>(
        `select p.user_id, u.name from live_quiz_players p join users u on u.id = p.user_id
          where p.quiz_id = $1`,
        [quiz.id]
      ),
      this.pool.query<{
        user_id: string;
        question: number;
        choice: number;
        correct: boolean;
        points: number;
      }>(
        `select user_id, question, choice, correct, points from live_quiz_answers
          where quiz_id = $1`,
        [quiz.id]
      ),
    ]);
    const revealed = quiz.status === 'reveal' || quiz.status === 'finished';
    const q = quiz.current >= 0 ? quiz.questions[quiz.current] : undefined;
    const currentAnswers = answers.rows.filter((a) => a.question === quiz.current);
    const points = new Map<string, number>();
    for (const a of answers.rows)
      points.set(a.user_id, (points.get(a.user_id) ?? 0) + a.points);
    const mine = currentAnswers.find((a) => a.user_id === callerId);
    const joined = players.rows.some((p) => p.user_id === callerId);
    const showQuestion = q && quiz.status !== 'lobby' && quiz.status !== 'finished';

    return {
      id: quiz.id,
      status: quiz.status,
      questionCount: quiz.questions.length,
      current: quiz.current,
      questionSeconds: QUESTION_SECONDS,
      questionStartedAt: quiz.question_started_at?.toISOString() ?? null,
      players: players.rows.length,
      answered: currentAnswers.length,
      question: showQuestion
        ? {
            index: quiz.current,
            wordId: q.wordId,
            prompt: q.prompt,
            options: q.options,
            correct: revealed || teacher ? q.correct : null,
            distribution: revealed
              ? q.options.map(
                  (_, i) => currentAnswers.filter((a) => a.choice === i).length
                )
              : null,
          }
        : null,
      you: teacher
        ? null
        : {
            joined,
            points: points.get(callerId) ?? 0,
            answer: mine
              ? { choice: mine.choice, correct: revealed ? mine.correct : null }
              : null,
          },
      leaderboard: revealed
        ? leaderboard(
            players.rows.map((p) => ({
              userId: p.user_id,
              name: p.name,
              points: points.get(p.user_id) ?? 0,
            })),
            callerId
          )
        : [],
    };
  }
}
