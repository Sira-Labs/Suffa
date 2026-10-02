/**
 * Feedback while testing: impressions sent from any page of the app, read by the admins.
 * Newest first with keyset pagination (served by feedback_created_idx).
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';

export const FEEDBACK_KINDS = ['bug', 'idea', 'confusing', 'praise'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export type FeedbackStatus = 'new' | 'done';

export interface NewFeedback {
  userId: string | null;
  kind: FeedbackKind;
  message: string;
  page: string;
  appVersion: string;
  userAgent: string;
}

export interface Feedback {
  id: string;
  kind: FeedbackKind;
  message: string;
  page: string;
  appVersion: string;
  userAgent: string;
  status: FeedbackStatus;
  createdAt: string;
  /** The sender when signed in (and the account still exists). */
  sender: { id: string; name: string | null; email: string | null; role: string } | null;
}

export interface FeedbackPage {
  items: Feedback[];
  /** Pass as `before` for the next page; null on the last one. */
  next: string | null;
  /** Feedback not marked done yet, over all pages. */
  open: number;
}

export interface FeedbackRepository {
  add(feedback: NewFeedback): Promise<string>;
  list(query: { before: string | null; limit: number }): Promise<FeedbackPage>;
  /** False when there is no such feedback. */
  setStatus(id: string, status: FeedbackStatus): Promise<boolean>;
}

export class PgFeedbackRepository implements FeedbackRepository {
  constructor(private readonly pool: pg.Pool) {}

  async add(feedback: NewFeedback): Promise<string> {
    const id = randomUUID();
    await this.pool.query(
      `insert into feedback (id, user_id, kind, message, page, app_version, user_agent)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        feedback.userId,
        feedback.kind,
        feedback.message,
        feedback.page,
        feedback.appVersion,
        feedback.userAgent,
      ]
    );
    return id;
  }

  async list(query: { before: string | null; limit: number }): Promise<FeedbackPage> {
    const [rows, open] = await Promise.all([
      this.pool.query(
        `select f.*, u.name as sender_name, u.email as sender_email, u.role as sender_role
           from feedback f left join users u on u.id = f.user_id
          where $1::uuid is null
             or (f.created_at, f.id) < (select created_at, id from feedback where id = $1)
          order by f.created_at desc, f.id desc
          limit $2`,
        [query.before, query.limit + 1]
      ),
      this.pool.query(`select count(*)::int as n from feedback where status = 'new'`),
    ]);
    const items = rows.rows.slice(0, query.limit).map(toFeedback);
    return {
      items,
      next: rows.rows.length > query.limit ? items[items.length - 1]!.id : null,
      open: open.rows[0].n as number,
    };
  }

  async setStatus(id: string, status: FeedbackStatus): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'update feedback set status = $2 where id = $1',
      [id, status]
    );
    return rowCount === 1;
  }
}

function toFeedback(row: Record<string, unknown>): Feedback {
  return {
    id: row.id as string,
    kind: row.kind as FeedbackKind,
    message: row.message as string,
    page: row.page as string,
    appVersion: row.app_version as string,
    userAgent: row.user_agent as string,
    status: row.status as FeedbackStatus,
    createdAt: (row.created_at as Date).toISOString(),
    sender: row.user_id
      ? {
          id: row.user_id as string,
          name: (row.sender_name as string | null) ?? null,
          email: (row.sender_email as string | null) ?? null,
          role: row.sender_role as string,
        }
      : null,
  };
}
