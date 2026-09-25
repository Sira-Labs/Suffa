/**
 * The learner snapshot for the tutor (ADR-0011): a compact, privacy-light view of the caller's
 * synced progress. Always loaded for the signed-in user's id, never an id from the model.
 */
import type pg from 'pg';
import type { ContentCatalog } from './content.js';

export type TutorLanguage = 'de' | 'en';
export type TashkilLevel = 'full' | 'partial' | 'none';

export interface LearnerSnapshot {
  /** First name only (ADR-0011 privacy). */
  firstName: string | null;
  tutorLanguage: TutorLanguage;
  tashkilLevel: TashkilLevel;
  currentUnit: number;
  enrolledUnits: number[];
  cards: { total: number; due: number; leeches: number };
  /** Words the learner keeps forgetting (leeches first, then most lapses). */
  troubleWords: { ar: string; de: string }[];
  lastExam: { units: number[]; score: number; total: number; finishedAt: string } | null;
}

export interface LearnerState {
  snapshot(userId: string): Promise<LearnerSnapshot>;
}

export class PgLearnerState implements LearnerState {
  constructor(
    private readonly pool: pg.Pool,
    private readonly catalog: ContentCatalog
  ) {}

  async snapshot(userId: string): Promise<LearnerSnapshot> {
    const [user, units, cards, trouble, exam, settings] = await Promise.all([
      this.pool.query('select name, tutor_language from users where id = $1', [userId]),
      this.pool.query(
        `select unit from unit_enrollments where user_id = $1 and not deleted
          order by "startedAt" desc`,
        [userId]
      ),
      this.pool.query(
        `select count(*)::int as total,
                count(*) filter (where due <= now())::int as due,
                count(*) filter (where leech)::int as leeches
           from srs_cards where user_id = $1 and not deleted`,
        [userId]
      ),
      this.pool.query(
        `select "contentRef" from srs_cards
          where user_id = $1 and not deleted and (leech or lapses >= 2)
          order by leech desc, lapses desc, "contentRef" limit 20`,
        [userId]
      ),
      this.pool.query(
        `select units, score, total, "finishedAt" from exam_results
          where user_id = $1 and not deleted order by "finishedAt" desc limit 1`,
        [userId]
      ),
      this.pool.query(
        `select "tashkilLevel" from settings where user_id = $1 and not deleted
          order by updated_at desc limit 1`,
        [userId]
      ),
    ]);
    const enrolled = [...new Set(units.rows.map((r) => r.unit as number))];
    const seen = new Set<string>();
    const troubleWords: LearnerSnapshot['troubleWords'] = [];
    for (const row of trouble.rows) {
      const word = this.catalog.word(row.contentRef as string);
      if (!word || seen.has(word.id)) continue;
      seen.add(word.id);
      troubleWords.push({ ar: word.ar, de: word.de });
      if (troubleWords.length === 8) break;
    }
    const e = exam.rows[0];
    const name = (user.rows[0]?.name as string | null | undefined)?.trim();
    return {
      firstName: name ? name.split(/\s+/)[0]!.slice(0, 40) : null,
      tutorLanguage: user.rows[0]?.tutor_language === 'en' ? 'en' : 'de',
      tashkilLevel:
        (settings.rows[0]?.tashkilLevel as TashkilLevel | undefined) ?? 'full',
      currentUnit: enrolled[0] ?? 1,
      enrolledUnits: [...enrolled].sort((a, b) => a - b),
      cards: cards.rows[0] as LearnerSnapshot['cards'],
      troubleWords,
      lastExam: e
        ? {
            units: e.units as number[],
            score: e.score as number,
            total: e.total as number,
            finishedAt: (e.finishedAt as Date).toISOString(),
          }
        : null,
    };
  }
}
