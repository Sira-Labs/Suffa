/**
 * Unit certificates (story 14.3, engagement plan §4): "Unit n complete" at ≥ 90 % unit mastery
 * — the share of the unit's course words with a mature card (interval ≥ 21 days), the same
 * measure as the mastery rings. Teachers award them; the server re-checks mastery on award, so
 * a certificate always reflects what the learner actually knew at that moment.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { writeAudit } from '../audit/log.js';
import { inTransaction } from '../db/transaction.js';

export const CERTIFICATE_MASTERY = 90;
/** A card counts as known from this interval on (days), as for the mastery rings. */
export const MATURE_INTERVAL_DAYS = 21;

export interface UnitWords {
  unit: number;
  title: string;
  wordIds: readonly string[];
}

export interface Certificate {
  id: string;
  userId: string;
  learnerName: string | null;
  unit: number;
  unitTitle: string;
  mastery: number;
  className: string;
  teacherName: string | null;
  awardedAt: string;
}

export interface EligibleLearner {
  userId: string;
  name: string | null;
  unit: number;
  unitTitle: string;
  mastery: number;
}

export interface ClassCertificates {
  threshold: number;
  eligible: EligibleLearner[];
  awarded: Certificate[];
}

export type AwardResult =
  | { ok: true; certificate: Certificate }
  | { ok: false; reason: 'not_a_learner' | 'unknown_unit' | 'not_eligible' | 'exists' };

export interface CertificateRepository {
  forClass(classId: string): Promise<ClassCertificates>;
  award(
    actor: { id: string; ip: string | null },
    classId: string,
    userId: string,
    unit: number
  ): Promise<AwardResult>;
  revoke(
    actor: { id: string; ip: string | null },
    classId: string,
    certificateId: string
  ): Promise<boolean>;
  mine(userId: string): Promise<Certificate[]>;
}

/** Mastery per unit in whole percent (rounded down, so 89.9 % is not 90 %). */
export function masteryByUnit(
  matureRefs: ReadonlySet<string>,
  units: readonly UnitWords[]
): Map<number, number> {
  return new Map(
    units
      .filter((u) => u.wordIds.length > 0)
      .map((u) => [
        u.unit,
        Math.floor(
          (u.wordIds.filter((id) => matureRefs.has(id)).length * 100) / u.wordIds.length
        ),
      ])
  );
}

interface CertificateRow {
  id: string;
  user_id: string;
  learner_name: string | null;
  unit: number;
  mastery: number;
  class_name: string;
  teacher_name: string | null;
  awarded_at: Date;
}

const SELECT_CERTIFICATES = `
  select c.id, c.user_id, u.name as learner_name, c.unit, c.mastery, c.class_name,
         c.teacher_name, c.awarded_at
    from certificates c join users u on u.id = c.user_id`;

export class PgCertificateRepository implements CertificateRepository {
  private readonly byUnit: Map<number, UnitWords>;
  private readonly allWords: string[];

  constructor(
    private readonly pool: pg.Pool,
    units: readonly UnitWords[]
  ) {
    this.byUnit = new Map(units.map((u) => [u.unit, u]));
    this.allWords = units.flatMap((u) => [...u.wordIds]);
  }

  private toCertificate(r: CertificateRow): Certificate {
    return {
      id: r.id,
      userId: r.user_id,
      learnerName: r.learner_name,
      unit: r.unit,
      unitTitle: this.byUnit.get(r.unit)?.title ?? `Einheit ${r.unit}`,
      mastery: r.mastery,
      className: r.class_name,
      teacherName: r.teacher_name,
      awardedAt: r.awarded_at.toISOString(),
    };
  }

  /** Mature course words per learner. */
  private async matureRefs(
    db: pg.Pool | pg.PoolClient,
    userIds: string[]
  ): Promise<Map<string, Set<string>>> {
    const byUser = new Map(userIds.map((id) => [id, new Set<string>()]));
    if (userIds.length === 0) return byUser;
    const { rows } = await db.query<{ user_id: string; ref: string }>(
      `select distinct user_id, "contentRef" as ref from srs_cards
        where user_id = any($1::uuid[]) and not deleted and interval >= $2
          and "contentRef" = any($3::text[])`,
      [userIds, MATURE_INTERVAL_DAYS, this.allWords]
    );
    for (const r of rows) byUser.get(r.user_id)?.add(r.ref);
    return byUser;
  }

  async forClass(classId: string): Promise<ClassCertificates> {
    const [students, awarded] = await Promise.all([
      this.pool.query<{ id: string; name: string | null }>(
        `select u.id, u.name from class_members cm join users u on u.id = cm.user_id
          where cm.class_id = $1 and cm.status = 'active' and cm.class_role = 'student'
          order by coalesce(nullif(u.name, ''), u.email)`,
        [classId]
      ),
      this.pool.query<CertificateRow>(
        `${SELECT_CERTIFICATES}
          where c.user_id in (select user_id from class_members
                               where class_id = $1 and status = 'active')
          order by c.awarded_at desc`,
        [classId]
      ),
    ]);
    const have = new Set(awarded.rows.map((r) => `${r.user_id}:${r.unit}`));
    const refs = await this.matureRefs(
      this.pool,
      students.rows.map((s) => s.id)
    );
    const eligible: EligibleLearner[] = [];
    for (const s of students.rows) {
      const mastery = masteryByUnit(refs.get(s.id) ?? new Set(), [
        ...this.byUnit.values(),
      ]);
      for (const [unit, percent] of mastery) {
        if (percent >= CERTIFICATE_MASTERY && !have.has(`${s.id}:${unit}`)) {
          eligible.push({
            userId: s.id,
            name: s.name,
            unit,
            unitTitle: this.byUnit.get(unit)!.title,
            mastery: percent,
          });
        }
      }
    }
    return {
      threshold: CERTIFICATE_MASTERY,
      eligible: eligible.sort((a, b) => a.unit - b.unit),
      awarded: awarded.rows.map((r) => this.toCertificate(r)),
    };
  }

  async award(
    actor: { id: string; ip: string | null },
    classId: string,
    userId: string,
    unit: number
  ): Promise<AwardResult> {
    const words = this.byUnit.get(unit);
    if (!words) return { ok: false, reason: 'unknown_unit' };
    return inTransaction(this.pool, async (db) => {
      const member = await db.query<{ class_name: string; teacher_name: string | null }>(
        `select c.name as class_name,
                (select nullif(name, '') from users where id = $3) as teacher_name
           from class_members cm join classes c on c.id = cm.class_id
          where cm.class_id = $1 and cm.user_id = $2
            and cm.status = 'active' and cm.class_role = 'student'`,
        [classId, userId, actor.id]
      );
      const row = member.rows[0];
      if (!row) return { ok: false, reason: 'not_a_learner' } as const;
      const refs = (await this.matureRefs(db, [userId])).get(userId) ?? new Set();
      const mastery = masteryByUnit(refs, [words]).get(unit) ?? 0;
      if (mastery < CERTIFICATE_MASTERY)
        return { ok: false, reason: 'not_eligible' } as const;
      const inserted = await db.query<{ id: string }>(
        `insert into certificates (id, user_id, unit, mastery, class_id, class_name,
                                   awarded_by, teacher_name)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (user_id, unit) do nothing
         returning id`,
        [
          randomUUID(),
          userId,
          unit,
          mastery,
          classId,
          row.class_name,
          actor.id,
          row.teacher_name,
        ]
      );
      const id = inserted.rows[0]?.id;
      if (!id) return { ok: false, reason: 'exists' } as const;
      await writeAudit(db, {
        actorId: actor.id,
        action: 'certificate.awarded',
        targetType: 'user',
        targetId: userId,
        details: { classId, unit, mastery },
        ipAddress: actor.ip,
      });
      const saved = await db.query<CertificateRow>(
        `${SELECT_CERTIFICATES} where c.id = $1`,
        [id]
      );
      return { ok: true, certificate: this.toCertificate(saved.rows[0]!) } as const;
    });
  }

  async revoke(
    actor: { id: string; ip: string | null },
    classId: string,
    certificateId: string
  ): Promise<boolean> {
    return inTransaction(this.pool, async (db) => {
      const { rows } = await db.query<{ user_id: string; unit: number }>(
        'delete from certificates where id = $1 and class_id = $2 returning user_id, unit',
        [certificateId, classId]
      );
      const gone = rows[0];
      if (!gone) return false;
      await writeAudit(db, {
        actorId: actor.id,
        action: 'certificate.revoked',
        targetType: 'user',
        targetId: gone.user_id,
        details: { classId, unit: gone.unit },
        ipAddress: actor.ip,
      });
      return true;
    });
  }

  async mine(userId: string): Promise<Certificate[]> {
    const { rows } = await this.pool.query<CertificateRow>(
      `${SELECT_CERTIFICATES} where c.user_id = $1 order by c.unit`,
      [userId]
    );
    return rows.map((r) => this.toCertificate(r));
  }
}
