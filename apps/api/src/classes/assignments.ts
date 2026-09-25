/**
 * Class assignments (story 8.5): the teacher sets a unit (its test) or a recording (heard)
 * with a due date; learners see them as class quests on "Heute". Completion is derived from
 * synced data: a passed unit test (≥ 80 %) or a recording heard to 85 %.
 */
import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import type pg from 'pg';
import { z } from 'zod';
import type { AuthResolver } from '../auth/resolver.js';
import { authorize, type ActorEnv, type AuthorizeLog } from '../authz/middleware.js';
import type { Actor as PolicyActor, ClassScope } from '../authz/policies.js';

export interface Assignment {
  id: string;
  kind: 'unit' | 'recording';
  ref: string;
  title: string;
  dueAt: string;
  /** For learners: done by them. */
  done: boolean | null;
  /** For teachers: learners done / all active learners. */
  doneCount: number | null;
  learners: number | null;
}

/** Assignments stay listed this long after their due date. */
export const SHOW_AFTER_DUE_DAYS = 14;

export interface AssignmentRepository {
  list(classId: string, viewerId: string, teacherView: boolean): Promise<Assignment[]>;
  create(
    classId: string,
    by: string,
    a: { kind: 'unit' | 'recording'; ref: string; title: string; dueAt: string }
  ): Promise<string | null>;
  remove(classId: string, id: string): Promise<boolean>;
}

/** Done-ness per (assignment, learner) in SQL: $1 = class. */
const DONE = `
  case a.kind
    when 'unit' then exists (
      select 1 from exam_results e
       where e.user_id = m.user_id and not e.deleted and e.format <> 'stage_test'
         and e.units = jsonb_build_array(a.ref::int) and e.total > 0
         and e.score::float / e.total >= 0.8)
    else exists (
      select 1 from media_progress p
       where p.user_id = m.user_id and not p.deleted
         and p.id = 'rec/' || a.ref and p."completedAt" is not null)
  end`;

export class PgAssignmentRepository implements AssignmentRepository {
  constructor(
    private readonly pool: pg.Pool,
    private readonly now: () => Date = () => new Date()
  ) {}

  async list(classId: string, viewerId: string, teacherView: boolean) {
    const since = new Date(this.now().getTime() - SHOW_AFTER_DUE_DAYS * 86_400_000);
    const { rows } = await this.pool.query(
      `select a.id, a.kind, a.ref, a.title, a.due_at,
              count(m.user_id) filter (where ${DONE})::int as done_count,
              count(m.user_id)::int as learners,
              bool_or(m.user_id = $3 and ${DONE}) as mine
         from class_assignments a
         left join class_members m
           on m.class_id = a.class_id and m.status = 'active' and m.class_role = 'student'
        where a.class_id = $1 and a.due_at >= $2
        group by a.id
        order by a.due_at, a.created_at`,
      [classId, since, viewerId]
    );
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      ref: r.ref,
      title: r.title,
      dueAt: r.due_at.toISOString(),
      done: teacherView ? null : r.mine === true,
      doneCount: teacherView ? r.done_count : null,
      learners: teacherView ? r.learners : null,
    }));
  }

  async create(
    classId: string,
    by: string,
    a: { kind: 'unit' | 'recording'; ref: string; title: string; dueAt: string }
  ) {
    if (a.kind === 'recording') {
      // Only published recordings of this class.
      const { rows } = await this.pool.query(
        `select 1 from media_items where id::text = $1 and class_id = $2
            and status = 'ready' and published_at is not null`,
        [a.ref, classId]
      );
      if (rows.length === 0) return null;
    }
    const id = randomUUID();
    await this.pool.query(
      `insert into class_assignments (id, class_id, kind, ref, title, due_at, created_by)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [id, classId, a.kind, a.ref, a.title, a.dueAt, by]
    );
    return id;
  }

  async remove(classId: string, id: string) {
    const { rowCount } = await this.pool.query(
      'delete from class_assignments where class_id = $1 and id = $2',
      [classId, id]
    );
    return (rowCount ?? 0) > 0;
  }
}

export interface AssignmentRouteDeps {
  classes: { scope(classId: string, userId: string): Promise<ClassScope> };
  repo: AssignmentRepository;
  auth: AuthResolver;
  log: AuthorizeLog;
}

const Uuid = z.string().uuid();
const NewAssignment = z
  .object({
    kind: z.enum(['unit', 'recording']),
    ref: z.string().trim().min(1).max(64),
    title: z.string().trim().min(1).max(120),
    dueAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .refine((a) => a.kind !== 'unit' || /^(?:[1-9]|1[0-6])$/.test(a.ref), 'unit 1–16')
  .refine((a) => a.kind !== 'recording' || Uuid.safeParse(a.ref).success, 'recording id');

/**
 *   GET    /classes/:id/assignments                → { assignments }  (class:read)
 *   POST   /classes/:id/assignments { kind, ref, title, dueAt } → 201 (class:manage)
 *   DELETE /classes/:id/assignments/:assignmentId  → 204              (class:manage)
 */
export function createAssignmentRoutes(deps: AssignmentRouteDeps): Hono<ActorEnv> {
  const app = new Hono<ActorEnv>();
  const scope = async (c: Context, actor: PolicyActor) => {
    const id = Uuid.safeParse(c.req.param('id'));
    return id.success ? deps.classes.scope(id.data, actor.id) : { classRole: null };
  };
  const manage = authorize(deps.auth, 'class:manage', deps.log, scope);
  const read = authorize(deps.auth, 'class:read', deps.log, scope);

  app.get('/classes/:id/assignments', read, async (c) => {
    const actor = c.get('actor');
    const teacher =
      actor.role === 'admin' ||
      (await deps.classes.scope(c.req.param('id'), actor.id)).classRole === 'teacher';
    c.header('Cache-Control', 'no-store');
    return c.json({
      assignments: await deps.repo.list(c.req.param('id'), actor.id, teacher),
    });
  });

  app.post('/classes/:id/assignments', manage, async (c) => {
    let body: unknown = null;
    try {
      body = await c.req.json();
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
    const parsed = NewAssignment.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
    const id = await deps.repo.create(c.req.param('id'), c.get('actor').id, parsed.data);
    return id ? c.json({ id }, 201) : c.json({ error: 'not_found' }, 404);
  });

  app.delete('/classes/:id/assignments/:assignmentId', manage, async (c) => {
    const id = Uuid.safeParse(c.req.param('assignmentId'));
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    return (await deps.repo.remove(c.req.param('id'), id.data))
      ? c.body(null, 204)
      : c.json({ error: 'not_found' }, 404);
  });

  return app;
}
