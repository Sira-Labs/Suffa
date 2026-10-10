/**
 * Course units in the CMS (story 16.1, ADR-0014). One row per unit holds the working draft,
 * the review state and the last published unit file.
 *
 *   draft ──submit──▶ review ──publish──▶ published
 *     ▲                 │  ▲                  │
 *     └──── return ─────┘  └───── submit ─────┘   (re-review without changes)
 *
 * Saving a draft moves the unit back to "draft" and needs the revision it started from, so two
 * editors never overwrite each other. A teacher checks the revision under review; a later save
 * makes that check stale. Every change is audit-logged in the same transaction.
 */
import type pg from 'pg';
import { writeAudit } from '../audit/log.js';
import { inTransaction } from '../db/transaction.js';
import {
  contentIds,
  contentOfFile,
  diffUnits,
  type ItemChanges,
  type UnitContent,
  type UnitFile,
} from './schema.js';

export type UnitState = 'draft' | 'review' | 'published';

export interface UnitSummary {
  id: string;
  course: string;
  unit: number;
  title: string;
  state: UnitState;
  revision: number;
  /** A teacher checked the current revision. */
  checked: boolean;
  checkedAt: string | null;
  checkedBy: string | null;
  reviewNote: string | null;
  publishedRevision: number | null;
  publishedAt: string | null;
  updatedAt: string;
  updatedBy: string | null;
  counts: { vokabeln: number; dialoge: number; grammatik: number };
}

export interface UnitDetail extends UnitSummary {
  draft: UnitContent;
  published: UnitFile | null;
  /** What the draft changes against the published unit. */
  changes: ItemChanges;
}

export interface SeedUnit {
  course: string;
  file: UnitFile;
}

/** Who acts, for the audit log. */
export interface ContentActor {
  id: string;
  ipAddress: string | null;
}

export type TransitionResult =
  | { ok: true; revision: number }
  | { ok: false; reason: 'not_found' | 'stale_revision' | 'wrong_state' };

export type SaveResult =
  | TransitionResult
  | { ok: false; reason: 'id_taken'; issues: string[] };

export interface ContentRepository {
  /** Inserts units that are not there yet; returns how many. */
  seed(units: SeedUnit[]): Promise<number>;
  list(): Promise<UnitSummary[]>;
  get(id: string): Promise<UnitDetail | null>;
  saveDraft(
    id: string,
    actor: ContentActor,
    revision: number,
    content: UnitContent
  ): Promise<SaveResult>;
  submit(id: string, actor: ContentActor, revision: number): Promise<TransitionResult>;
  check(id: string, actor: ContentActor, revision: number): Promise<TransitionResult>;
  /** A teacher sends the unit back to the editors with a note. */
  returnToDraft(
    id: string,
    actor: ContentActor,
    revision: number,
    note: string
  ): Promise<TransitionResult>;
  publish(id: string, actor: ContentActor, revision: number): Promise<TransitionResult>;
}

export const unitId = (course: string, unit: number) => `${course}/${unit}`;

interface UnitRow {
  id: string;
  course: string;
  unit: number;
  title: string;
  state: UnitState;
  revision: number;
  checked_revision: number | null;
  checked_at: Date | null;
  checked_by_email: string | null;
  review_note: string | null;
  published_revision: number | null;
  published_at: Date | null;
  updated_at: Date;
  updated_by_email: string | null;
  draft: UnitContent;
  published: UnitFile | null;
}

const SELECT_UNIT = `
  select u.id, u.course, u.unit, u.title, u.state, u.revision, u.checked_revision,
         u.checked_at, cb.email as checked_by_email, u.review_note, u.published_revision,
         u.published_at, u.updated_at, ub.email as updated_by_email, u.draft, u.published
    from content_units u
    left join users cb on cb.id = u.checked_by
    left join users ub on ub.id = u.updated_by`;

function summary(row: UnitRow): UnitSummary {
  return {
    id: row.id,
    course: row.course,
    unit: row.unit,
    title: row.title,
    state: row.state,
    revision: row.revision,
    checked: row.checked_revision === row.revision,
    checkedAt: row.checked_at?.toISOString() ?? null,
    checkedBy: row.checked_by_email,
    reviewNote: row.review_note,
    publishedRevision: row.published_revision,
    publishedAt: row.published_at?.toISOString() ?? null,
    updatedAt: row.updated_at.toISOString(),
    updatedBy: row.updated_by_email,
    counts: {
      vokabeln: row.draft.vokabeln.length,
      dialoge: row.draft.dialoge.length,
      grammatik: row.draft.grammatik.length,
    },
  };
}

/** At most this many IDs per list in an audit entry (the counts are always complete). */
const AUDIT_ID_LIMIT = 50;

export class PgContentRepository implements ContentRepository {
  constructor(private readonly pool: pg.Pool) {}

  async seed(units: SeedUnit[]): Promise<number> {
    return inTransaction(this.pool, async (client) => {
      const inserted: string[] = [];
      for (const { course, file } of units) {
        const id = unitId(course, file.einheit);
        const content = contentOfFile(file);
        const checked = file.status === 'geprueft';
        const { rowCount } = await client.query(
          `insert into content_units
             (id, course, unit, title, state, draft, revision, checked_revision, checked_at,
              published, published_revision, published_at)
           values ($1, $2, $3, $4, 'published', $5::jsonb, 1, $6, $7, $8::jsonb, 1, now())
           on conflict (id) do nothing`,
          [
            id,
            course,
            file.einheit,
            content.titel,
            JSON.stringify(content),
            checked ? 1 : null,
            checked ? new Date() : null,
            JSON.stringify(file),
          ]
        );
        if (!rowCount) continue;
        inserted.push(id);
        await registerIds(client, id, content);
      }
      if (inserted.length > 0) {
        await writeAudit(client, {
          actorId: null,
          action: 'content.units_seeded',
          targetType: 'content_unit',
          targetId: inserted.length === 1 ? inserted[0]! : `${inserted.length} units`,
          details: { units: inserted },
        });
      }
      return inserted.length;
    });
  }

  async list(): Promise<UnitSummary[]> {
    const { rows } = await this.pool.query<UnitRow>(
      `${SELECT_UNIT} order by u.course, u.unit`
    );
    return rows.map(summary);
  }

  async get(id: string): Promise<UnitDetail | null> {
    const { rows } = await this.pool.query<UnitRow>(`${SELECT_UNIT} where u.id = $1`, [
      id,
    ]);
    const row = rows[0];
    if (!row) return null;
    return {
      ...summary(row),
      draft: row.draft,
      published: row.published,
      changes: diffUnits(row.published ? contentOfFile(row.published) : null, row.draft),
    };
  }

  async saveDraft(
    id: string,
    actor: ContentActor,
    revision: number,
    content: UnitContent
  ): Promise<SaveResult> {
    return inTransaction(this.pool, async (client) => {
      const current = await lockUnit(client, id);
      if (!current) return { ok: false, reason: 'not_found' };
      if (current.revision !== revision) return { ok: false, reason: 'stale_revision' };

      // Content IDs are never reused: one that ever belonged to another unit stays theirs.
      const ids = contentIds(content).map((i) => i.id);
      const { rows: taken } = await client.query<{ id: string; unit_id: string }>(
        `select id, unit_id from content_ids where id = any($1::text[]) and unit_id <> $2`,
        [ids, id]
      );
      if (taken.length > 0) {
        return {
          ok: false,
          reason: 'id_taken',
          issues: taken.map((t) => `id ${t.id} belongs to ${t.unit_id}`),
        };
      }

      const changes = diffUnits(current.draft, content);
      const next = revision + 1;
      await client.query(
        `update content_units
            set draft = $2::jsonb, title = $3, revision = $4, state = 'draft',
                updated_by = $5, updated_at = now()
          where id = $1`,
        [id, JSON.stringify(content), content.titel, next, actor.id]
      );
      await registerIds(client, id, content);
      await writeAudit(client, {
        actorId: actor.id,
        action: 'content.unit_saved',
        targetType: 'content_unit',
        targetId: id,
        ipAddress: actor.ipAddress,
        details: {
          revision: next,
          added: changes.added.slice(0, AUDIT_ID_LIMIT),
          removed: changes.removed.slice(0, AUDIT_ID_LIMIT),
          changed: changes.changed.slice(0, AUDIT_ID_LIMIT),
          counts: {
            added: changes.added.length,
            removed: changes.removed.length,
            changed: changes.changed.length,
          },
          textChanged: changes.textChanged,
        },
      });
      return { ok: true, revision: next };
    });
  }

  submit(id: string, actor: ContentActor, revision: number): Promise<TransitionResult> {
    return this.transition(id, actor, revision, {
      from: ['draft', 'published'],
      action: 'content.unit_submitted',
      update: `state = 'review', review_note = null`,
    });
  }

  check(id: string, actor: ContentActor, revision: number): Promise<TransitionResult> {
    return this.transition(id, actor, revision, {
      from: ['review'],
      action: 'content.unit_checked',
      update: `checked_revision = revision, checked_by = $2, checked_at = now()`,
      params: [actor.id],
    });
  }

  returnToDraft(
    id: string,
    actor: ContentActor,
    revision: number,
    note: string
  ): Promise<TransitionResult> {
    return this.transition(id, actor, revision, {
      from: ['review'],
      action: 'content.unit_returned',
      update: `state = 'draft', review_note = $2`,
      params: [note],
      details: { note },
    });
  }

  publish(id: string, actor: ContentActor, revision: number): Promise<TransitionResult> {
    // The published file is the draft with its number and review status: what learners get.
    return this.transition(id, actor, revision, {
      from: ['review'],
      action: 'content.unit_published',
      update: `state = 'published', review_note = null,
               published = draft || jsonb_build_object(
                 'einheit', unit,
                 'status', case when checked_revision = revision then 'geprueft' else 'entwurf' end),
               published_revision = revision, published_by = $2, published_at = now()`,
      params: [actor.id],
    });
  }

  /**
   * One state change: locks the row, checks state and revision, updates and audits. `update`
   * is a fixed SQL fragment of this class ($1 = id, then `params` as $2, …), never input.
   */
  private async transition(
    id: string,
    actor: ContentActor,
    revision: number,
    step: {
      from: UnitState[];
      action: string;
      update: string;
      params?: unknown[];
      details?: Record<string, unknown>;
    }
  ): Promise<TransitionResult> {
    return inTransaction(this.pool, async (client) => {
      const current = await lockUnit(client, id);
      if (!current) return { ok: false, reason: 'not_found' };
      if (current.revision !== revision) return { ok: false, reason: 'stale_revision' };
      if (!step.from.includes(current.state)) return { ok: false, reason: 'wrong_state' };
      await client.query(`update content_units set ${step.update} where id = $1`, [
        id,
        ...(step.params ?? []),
      ]);
      await writeAudit(client, {
        actorId: actor.id,
        action: step.action,
        targetType: 'content_unit',
        targetId: id,
        ipAddress: actor.ipAddress,
        details: { revision, from: current.state, ...step.details },
      });
      return { ok: true, revision };
    });
  }
}

async function lockUnit(
  client: pg.PoolClient,
  id: string
): Promise<{ state: UnitState; revision: number; draft: UnitContent } | null> {
  const { rows } = await client.query<{
    state: UnitState;
    revision: number;
    draft: UnitContent;
  }>(`select state, revision, draft from content_units where id = $1 for update`, [id]);
  return rows[0] ?? null;
}

async function registerIds(
  client: pg.PoolClient,
  id: string,
  content: UnitContent
): Promise<void> {
  const ids = contentIds(content);
  if (ids.length === 0) return;
  await client.query(
    `insert into content_ids (id, unit_id, kind)
     select * from unnest($1::text[], $2::text[], $3::text[])
     on conflict (id) do nothing`,
    [ids.map((i) => i.id), ids.map(() => id), ids.map((i) => i.kind)]
  );
}
