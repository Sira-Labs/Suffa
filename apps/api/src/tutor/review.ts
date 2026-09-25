/**
 * The teacher's review of grades (story 11.2): a queue of the class's graded texts, a verdict
 * per grade (confirm, or override score and comment), and an export of the reviewed grades
 * as eval cases for the grading prompt (story 11.3) — without names or ids of learners.
 */
import type pg from 'pg';
import type { Grade } from './grading.js';

export interface QueueItem extends Grade {
  learner: string;
}

export interface EvalCase {
  kind: Grade['kind'];
  task: string;
  answer: string;
  /** The score the teacher stands behind (their override or the confirmed model score). */
  expectedScore: number;
  modelScore: number;
  teacherComment: string | null;
  corrected: string | null;
}

export interface ReviewRepository {
  queue(
    classId: string,
    status: 'open' | 'reviewed',
    limit: number
  ): Promise<QueueItem[]>;
  /** Records the verdict on a grade of this class; false when it is not one. */
  review(
    classId: string,
    gradeId: string,
    reviewerId: string,
    verdict:
      | { decision: 'confirm' }
      | { decision: 'override'; score: number; comment: string; corrected: string | null }
  ): Promise<boolean>;
  evalCases(classId: string): Promise<EvalCase[]>;
}

export class PgReviewRepository implements ReviewRepository {
  constructor(private readonly pool: pg.Pool) {}

  async queue(classId: string, status: 'open' | 'reviewed', limit: number) {
    const { rows } = await this.pool.query(
      `select g.id, g.kind, g.task, g.answer, g.result, g.status, g.override, g.created_at,
              coalesce(nullif(u.name, ''), u.email) as learner
         from ai_grades g join users u on u.id = g.user_id
        where g.class_id = $1 and (g.status = 'auto') = $2
        order by g.created_at desc limit $3`,
      [classId, status === 'open', limit]
    );
    return rows.map((r) => ({
      ...(r.result as Grade),
      id: r.id as string,
      kind: r.kind as Grade['kind'],
      task: r.task as string,
      answer: r.answer as string,
      status: r.status as Grade['status'],
      override: (r.override as Grade['override']) ?? null,
      createdAt: (r.created_at as Date).toISOString(),
      learner: r.learner as string,
    }));
  }

  async review(
    classId: string,
    gradeId: string,
    reviewerId: string,
    verdict: Parameters<ReviewRepository['review']>[3]
  ) {
    const { rows } = await this.pool.query(
      `update ai_grades set status = $4, override = $5::jsonb, reviewed_by = $3,
              reviewed_at = now()
        where id = $2 and class_id = $1
       returning id`,
      [
        classId,
        gradeId,
        reviewerId,
        verdict.decision === 'confirm' ? 'confirmed' : 'overridden',
        verdict.decision === 'confirm'
          ? null
          : JSON.stringify({
              score: verdict.score,
              comment: verdict.comment,
              corrected: verdict.corrected,
            }),
      ]
    );
    return rows.length > 0;
  }

  async evalCases(classId: string) {
    const { rows } = await this.pool.query(
      `select kind, task, answer, result, status, override from ai_grades
        where class_id = $1 and status <> 'auto' order by reviewed_at`,
      [classId]
    );
    return rows.map((r) => {
      const result = r.result as Grade;
      const override = r.override as Grade['override'];
      return {
        kind: r.kind as Grade['kind'],
        task: r.task as string,
        answer: r.answer as string,
        expectedScore: override?.score ?? result.score,
        modelScore: result.score,
        teacherComment: override?.comment || null,
        corrected: override?.corrected ?? null,
      };
    });
  }
}
