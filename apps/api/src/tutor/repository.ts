/**
 * Tutor conversations (story 10.1): only what the learner saw is stored — their message and
 * the final answer — owned by the learner, deleted after 90 days of inactivity.
 */
import type pg from 'pg';
import type { TurnContext } from './prompt.js';

export interface ConversationSummary {
  id: string;
  title: string;
  context: TurnContext;
  updatedAt: string;
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  rating: -1 | 1 | null;
  createdAt: string;
}

export interface TutorRepository {
  create(c: {
    id: string;
    userId: string;
    title: string;
    context: TurnContext;
  }): Promise<void>;
  /** The conversation if it belongs to the user. */
  get(id: string, userId: string): Promise<ConversationSummary | null>;
  list(userId: string, limit: number): Promise<ConversationSummary[]>;
  messages(conversationId: string, limit: number): Promise<StoredMessage[]>;
  add(m: {
    id: string;
    conversationId: string;
    role: 'user' | 'assistant';
    content: string;
    model?: string | null;
    flags?: string[];
  }): Promise<void>;
  /** Rates an answer of the user's own conversation; false when there is none. */
  rate(messageId: string, userId: string, rating: -1 | 1 | null): Promise<boolean>;
  remove(id: string, userId: string): Promise<boolean>;
}

interface ConversationRow {
  id: string;
  title: string;
  context: TurnContext;
  updated_at: Date;
}

const summary = (r: ConversationRow): ConversationSummary => ({
  id: r.id,
  title: r.title,
  context: r.context,
  updatedAt: r.updated_at.toISOString(),
});

export class PgTutorRepository implements TutorRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(c: { id: string; userId: string; title: string; context: TurnContext }) {
    await this.pool.query(
      `insert into ai_conversations (id, user_id, title, context) values ($1, $2, $3, $4::jsonb)`,
      [c.id, c.userId, c.title, JSON.stringify(c.context)]
    );
  }

  async get(id: string, userId: string) {
    const { rows } = await this.pool.query<ConversationRow>(
      `select id, title, context, updated_at from ai_conversations
        where id = $1 and user_id = $2`,
      [id, userId]
    );
    return rows[0] ? summary(rows[0]) : null;
  }

  async list(userId: string, limit: number) {
    const { rows } = await this.pool.query<ConversationRow>(
      `select id, title, context, updated_at from ai_conversations
        where user_id = $1 order by updated_at desc limit $2`,
      [userId, limit]
    );
    return rows.map(summary);
  }

  async messages(conversationId: string, limit: number) {
    const { rows } = await this.pool.query(
      `select id, role, content, rating, created_at from (
         select * from ai_messages where conversation_id = $1
          order by created_at desc, id desc limit $2
       ) m order by created_at, id`,
      [conversationId, limit]
    );
    return rows.map((r) => ({
      id: r.id as string,
      role: r.role as 'user' | 'assistant',
      content: r.content as string,
      rating: r.rating as -1 | 1 | null,
      createdAt: (r.created_at as Date).toISOString(),
    }));
  }

  async add(m: {
    id: string;
    conversationId: string;
    role: 'user' | 'assistant';
    content: string;
    model?: string | null;
    flags?: string[];
  }) {
    await this.pool.query(
      `with inserted as (
         insert into ai_messages (id, conversation_id, role, content, model, flags)
         values ($1, $2, $3, $4, $5, $6)
       )
       update ai_conversations set updated_at = now() where id = $2`,
      [m.id, m.conversationId, m.role, m.content, m.model ?? null, m.flags ?? []]
    );
  }

  async rate(messageId: string, userId: string, rating: -1 | 1 | null) {
    const { rows } = await this.pool.query(
      `update ai_messages m set rating = $3
         from ai_conversations c
        where m.id = $1 and m.role = 'assistant' and c.id = m.conversation_id
          and c.user_id = $2
       returning m.id`,
      [messageId, userId, rating]
    );
    return rows.length > 0;
  }

  async remove(id: string, userId: string) {
    const { rows } = await this.pool.query(
      'delete from ai_conversations where id = $1 and user_id = $2 returning id',
      [id, userId]
    );
    return rows.length > 0;
  }
}
