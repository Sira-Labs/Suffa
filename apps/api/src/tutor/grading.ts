/**
 * Grade mode (story 11.1): al-Muʿallim grades a written text or a speech transcript against a
 * fixed rubric returned as structured output, points to each mistake, and links mistakes to
 * course words so the app can bring those cards up for review. Every grade is stored for the
 * teacher's review (story 11.2).
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { z } from 'zod';
import type { Actor } from '../authz/policies.js';
import type { AiGateway } from '../ai/gateway.js';
import { foldArabic, type ContentCatalog } from './content.js';
import type { LearnerState } from './learner.js';

export type GradeKind = 'writing' | 'speech';

export const MISTAKE_CATEGORIES = [
  'spelling',
  'grammar',
  'vocabulary',
  'word_order',
  'vocalisation',
  'other',
] as const;

/** JSON schema for structured output (no numeric bounds: checked below instead). */
export const GRADE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'rubric', 'summary', 'corrected', 'mistakes'],
  properties: {
    score: { type: 'integer', description: 'Overall score from 0 to 100.' },
    rubric: {
      type: 'object',
      additionalProperties: false,
      required: ['task', 'grammar', 'vocabulary', 'spelling'],
      properties: {
        task: {
          type: 'integer',
          description: '0–4: does the text do what the task asks?',
        },
        grammar: { type: 'integer', description: '0–4' },
        vocabulary: { type: 'integer', description: '0–4: range and fit for the level' },
        spelling: {
          type: 'integer',
          description: '0–4: spelling (for speech: how clear the transcript is)',
        },
      },
    },
    summary: {
      type: 'string',
      description: 'Two or three encouraging sentences in the tutoring language.',
    },
    corrected: {
      type: 'string',
      description: 'The whole text corrected, fully vocalised.',
    },
    mistakes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['original', 'correction', 'category', 'explanation'],
        properties: {
          original: { type: 'string' },
          correction: { type: 'string' },
          category: { type: 'string', enum: [...MISTAKE_CATEGORIES] },
          explanation: {
            type: 'string',
            description: 'One sentence, tutoring language.',
          },
        },
      },
    },
  },
} as const;

const point = z
  .number()
  .int()
  .transform((n) => Math.min(4, Math.max(0, n)));
export const GradeResult = z.object({
  score: z
    .number()
    .int()
    .transform((n) => Math.min(100, Math.max(0, n))),
  rubric: z.object({ task: point, grammar: point, vocabulary: point, spelling: point }),
  summary: z.string().max(2000),
  corrected: z.string().max(6000),
  mistakes: z
    .array(
      z.object({
        original: z.string().max(500),
        correction: z.string().max(500),
        category: z.enum(MISTAKE_CATEGORIES),
        explanation: z.string().max(1000),
      })
    )
    .max(30),
});
export type GradeResult = z.infer<typeof GradeResult>;

export interface Mistake {
  original: string;
  correction: string;
  category: (typeof MISTAKE_CATEGORIES)[number];
  explanation: string;
  /** The course word the correction is, when there is one (for SRS review). */
  wordId: string | null;
}

export interface Grade extends Omit<GradeResult, 'mistakes'> {
  id: string;
  kind: GradeKind;
  task: string;
  answer: string;
  mistakes: Mistake[];
  status: 'auto' | 'confirmed' | 'overridden';
  override: { score: number; comment: string; corrected: string | null } | null;
  createdAt: string;
}

/** The model returned something that is not a rubric. */
export class GradeFormatError extends Error {}

export interface GradeRepository {
  /** The class whose teacher reviews the learner's grades (first active class as student). */
  studentClass(userId: string): Promise<string | null>;
  save(g: {
    id: string;
    userId: string;
    classId: string | null;
    kind: GradeKind;
    task: string;
    answer: string;
    result: Omit<
      Grade,
      'id' | 'kind' | 'task' | 'answer' | 'status' | 'override' | 'createdAt'
    >;
    model: string;
  }): Promise<void>;
  listOwn(userId: string, limit: number): Promise<Grade[]>;
}

function toGrade(r: Record<string, unknown>): Grade {
  const result = r.result as Omit<Grade, 'id'>;
  return {
    ...result,
    id: r.id as string,
    kind: r.kind as GradeKind,
    task: r.task as string,
    answer: r.answer as string,
    status: r.status as Grade['status'],
    override: (r.override as Grade['override']) ?? null,
    createdAt: (r.created_at as Date).toISOString(),
  };
}

export class PgGradeRepository implements GradeRepository {
  constructor(private readonly pool: pg.Pool) {}

  async studentClass(userId: string) {
    const { rows } = await this.pool.query(
      `select class_id from class_members
        where user_id = $1 and class_role = 'student' and status = 'active'
        order by joined_at limit 1`,
      [userId]
    );
    return (rows[0]?.class_id as string | undefined) ?? null;
  }

  async save(g: Parameters<GradeRepository['save']>[0]) {
    await this.pool.query(
      `insert into ai_grades (id, user_id, class_id, kind, task, answer, result, model)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [
        g.id,
        g.userId,
        g.classId,
        g.kind,
        g.task,
        g.answer,
        JSON.stringify(g.result),
        g.model,
      ]
    );
  }

  async listOwn(userId: string, limit: number) {
    const { rows } = await this.pool.query(
      `select id, kind, task, answer, result, status, override, created_at from ai_grades
        where user_id = $1 order by created_at desc limit $2`,
      [userId, limit]
    );
    return rows.map(toGrade);
  }
}

function graderPrompt(language: 'de' | 'en', kind: GradeKind): string {
  const lang = language === 'en' ? 'English' : 'German';
  return `You are al-Muʿallim, grading a learner's Arabic (Modern Standard Arabic, course "al-ʿArabiyya bayna yadayk") for Suffa.

Grade fairly for the learner's level: judge what they could know from the units they have reached (the unit content follows). Be encouraging and precise.
- score: 0–100 overall. rubric: 0–4 each for task fulfilment, grammar, vocabulary and spelling.
- corrected: the learner's whole text, corrected, fully vocalised; keep their wording where it is correct.
- mistakes: each real mistake once, with the learner's original, the correction, a category and one explanatory sentence. No mistakes for correct text; no style preferences.
- summary and explanations in ${lang}; Arabic in Arabic letters only.
${
  kind === 'speech'
    ? '- The text is an automatic transcript of speech: ignore punctuation, missing vowel marks and obvious recognition slips; grade grammar, vocabulary and task. Use "spelling" for how clear and complete the spoken text came through.'
    : '- The text was typed: spelling includes hamza, tāʾ marbūṭa and long vowels; vowel marks are optional unless the task asks for them.'
}`;
}

export interface GradeInput {
  kind: GradeKind;
  task: string;
  answer: string;
  unit?: number;
}

export class GradeService {
  constructor(
    private readonly deps: {
      gateway: AiGateway;
      repo: GradeRepository;
      catalog: ContentCatalog;
      learner: LearnerState;
      newId?: () => string;
    }
  ) {}

  async grade(actor: Actor, input: GradeInput): Promise<Grade> {
    const snapshot = await this.deps.learner.snapshot(actor.id);
    const unit =
      input.unit && this.deps.catalog.unit(input.unit)
        ? input.unit
        : snapshot.currentUnit;
    const result = await this.deps.gateway.complete(
      actor,
      input.kind === 'speech' ? 'grade.speech' : 'grade.writing',
      {
        system: [
          { text: graderPrompt(snapshot.tutorLanguage, input.kind), cache: true },
          { text: this.deps.catalog.pack(unit), cache: true },
          {
            text: `The learner is in unit ${snapshot.currentUnit} (started: ${snapshot.enrolledUnits.join(', ') || 'none'}).`,
          },
        ],
        messages: [
          {
            role: 'user',
            content: `Task: ${input.task || '(free writing)'}\n\nLearner's ${input.kind === 'speech' ? 'transcript' : 'text'}:\n${input.answer}`,
          },
        ],
        jsonSchema: GRADE_SCHEMA as unknown as Record<string, unknown>,
      }
    );
    let parsed: GradeResult;
    try {
      parsed = GradeResult.parse(JSON.parse(result.text));
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof z.ZodError) {
        throw new GradeFormatError('the model did not return a rubric');
      }
      throw error;
    }
    const mistakes = parsed.mistakes.map((m) => ({
      ...m,
      wordId: this.wordFor(m.correction),
    }));
    const grade: Grade = {
      ...parsed,
      mistakes,
      id: (this.deps.newId ?? randomUUID)(),
      kind: input.kind,
      task: input.task,
      answer: input.answer,
      status: 'auto',
      override: null,
      createdAt: new Date().toISOString(),
    };
    await this.deps.repo.save({
      id: grade.id,
      userId: actor.id,
      classId: await this.deps.repo.studentClass(actor.id),
      kind: input.kind,
      task: input.task,
      answer: input.answer,
      result: { ...parsed, mistakes },
      model: result.model,
    });
    return grade;
  }

  /**
   * A course word the correction is (ignoring vowels, letter variants, the article and a
   * leading و/ف/ب/ل/ك), so the app can bring its card up. Phrases are not matched.
   */
  private wordFor(correction: string): string | null {
    const folded = foldArabic(correction);
    if (!folded || folded.includes(' ')) return null;
    const bare = folded.replace(/^[وف]?[بلك]?ال/, '');
    for (const candidate of new Set([folded, bare])) {
      const match = this.deps.catalog
        .search(candidate, 5)
        .find((w) => foldArabic(w.ar) === candidate);
      if (match) return match.id;
    }
    return null;
  }
}
