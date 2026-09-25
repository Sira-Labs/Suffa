/**
 * Audit log (ADR-0009): every privileged change is recorded with who, what, on whom and from
 * where. Append-only; `details` holds before/after values, never secrets.
 */
import type pg from 'pg';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}

export interface AuditRecord extends Required<Omit<AuditEntry, 'details' | 'ipAddress'>> {
  id: string;
  actorEmail: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

export type Queryable = Pick<pg.PoolClient, 'query'>;

/** Writes one entry; pass the transaction's client so the change and its record commit together. */
export async function writeAudit(db: Queryable, entry: AuditEntry): Promise<void> {
  await db.query(
    `insert into audit_log (actor_id, action, target_type, target_id, details, ip_address)
     values ($1, $2, $3, $4, $5::jsonb, $6)`,
    [
      entry.actorId,
      entry.action,
      entry.targetType,
      entry.targetId,
      JSON.stringify(entry.details ?? {}),
      entry.ipAddress ?? null,
    ]
  );
}

/** Newest first, keyset-paginated by id (monotonic with insertion). */
export async function listAudit(
  db: Queryable,
  { beforeId, limit }: { beforeId: string | null; limit: number }
): Promise<{ entries: AuditRecord[]; next: string | null }> {
  const { rows } = await db.query<{
    id: string;
    actor_id: string | null;
    actor_email: string | null;
    action: string;
    target_type: string;
    target_id: string;
    details: Record<string, unknown>;
    ip_address: string | null;
    created_at: Date;
  }>(
    `select a.id, a.actor_id, u.email as actor_email, a.action, a.target_type, a.target_id,
            a.details, a.ip_address, a.created_at
       from audit_log a left join users u on u.id = a.actor_id
      where ($1::bigint is null or a.id < $1::bigint)
      order by a.id desc
      limit $2`,
    [beforeId, limit + 1]
  );
  const page = rows.slice(0, limit);
  return {
    entries: page.map((r) => ({
      id: String(r.id),
      actorId: r.actor_id,
      actorEmail: r.actor_email,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      details: r.details,
      ipAddress: r.ip_address,
      createdAt: r.created_at.toISOString(),
    })),
    next: rows.length > limit ? String(page.at(-1)!.id) : null,
  };
}
