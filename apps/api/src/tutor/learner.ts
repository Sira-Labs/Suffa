/**
 * The learner snapshot for the tutor (ADR-0011): a compact, privacy-light view of the caller's
 * synced progress. Always loaded for the signed-in user's id, never an id from the model.
 */
import type pg from 'pg';
import { PASS_RATIO, courseById, type CourseId } from '@suffa/engagement';
import type { ContentCatalog } from './content.js';
import { courseOrDefault } from './course.js';

export type TutorLanguage = 'de' | 'en';
export type TashkilLevel = 'full' | 'partial' | 'none';

export interface LearnerSnapshot {
  /** First name only (ADR-0011 privacy). */
  firstName: string | null;
  tutorLanguage: TutorLanguage;
  tashkilLevel: TashkilLevel;
  /** The course the learner follows (their setting, ADR-0025). */
  course: CourseId;
  /** The unit the learner works on, within their course. */
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
    const [user, units, cards, trouble, exam, settings, passed] = await Promise.all([
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
        `select "tashkilLevel", course from settings where user_id = $1 and not deleted
          order by updated_at desc limit 1`,
        [userId]
      ),
      this.pool.query(
        `select distinct jsonb_array_elements(units)::int as unit from exam_results
          where user_id = $1 and not deleted and format <> 'stage_test'
            and jsonb_array_length(units) = 1 and total > 0 and score >= total * $2::numeric`,
        [userId, PASS_RATIO]
      ),
    ]);
    const course = courseOrDefault(settings.rows[0]?.course);
    const courseUnits = courseById(course).units;
    const enrolled = [...new Set(units.rows.map((r) => r.unit as number))];
    const passedUnits = new Set(passed.rows.map((r) => r.unit as number));
    const seen = new Set<string>();
    const troubleWords: LearnerSnapshot['troubleWords'] = [];
    for (const row of trouble.rows) {
      const id = row.contentRef as string;
      const word = this.catalog.meaning(id);
      if (!word || seen.has(id)) continue;
      seen.add(id);
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
      course,
      // The latest started unit of the course; a course without enrolments (Madinah) is at its
      // first lesson whose test is not passed yet.
      currentUnit:
        enrolled.find((u) => courseUnits.includes(u)) ??
        courseUnits.find((u) => !passedUnits.has(u)) ??
        courseUnits.at(-1)!,
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
