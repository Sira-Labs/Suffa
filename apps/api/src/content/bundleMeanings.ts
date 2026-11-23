/**
 * Approved meanings in further languages on their way to learners (story 18.4, ADR-0032).
 * A content bundle carries each published word with the meanings a reviewer approved, under
 * `bedeutungen` (the flat `tr` is the transliteration). The unit files in `content_units`
 * stay as the CMS wrote them: the meanings are joined in when a bundle is frozen.
 */
import type pg from 'pg';
import type { MeaningDraftLanguage } from './meaningDrafts.js';
import type { UnitFile } from './schema.js';

export type FurtherMeanings = Partial<Record<MeaningDraftLanguage, string>>;

export type BundleWord = UnitFile['vokabeln'][number] & { bedeutungen?: FurtherMeanings };

/** A published unit as a bundle carries it. */
export type BundleUnit = Omit<UnitFile, 'vokabeln'> & { vokabeln: BundleWord[] };

export interface ApprovedMeaning {
  unit: number;
  wordId: string;
  language: MeaningDraftLanguage;
  /** The German the meaning was drafted from and approved for. */
  sourceDe: string;
  text: string;
}

/**
 * The units with the approved meanings of their words. A meaning counts for the German it was
 * approved for: when the published word says something else (the German was changed since, or
 * the change it was approved for is not published yet), learners get the German fallback.
 * Whatever a unit file itself says under `bedeutungen` is dropped: only a review puts a
 * meaning there.
 */
export function withApprovedMeanings(
  units: readonly UnitFile[],
  approved: readonly ApprovedMeaning[]
): BundleUnit[] {
  const meaningsOf = approvedByWord(approved);
  return units.map((unit) => ({
    ...unit,
    vokabeln: unit.vokabeln.map((word) => meaningsOf(unit.einheit, word)),
  }));
}

/**
 * Gives one word of a unit the meanings approved for its German, and takes away any other.
 * Also used for removed words kept as tombstones: a meaning rejected after the word was
 * removed must not stay with the cards that still show it.
 */
export function approvedByWord(
  approved: readonly ApprovedMeaning[]
): (unit: number, word: BundleWord) => BundleWord {
  const byWord = new Map<string, ApprovedMeaning[]>();
  for (const meaning of approved) {
    const key = `${meaning.unit}:${meaning.wordId}`;
    byWord.set(key, [...(byWord.get(key) ?? []), meaning]);
  }
  return (unit, word) => {
    const { bedeutungen: _unreviewed, ...plain } = word;
    const current = (byWord.get(`${unit}:${word.id}`) ?? [])
      .filter((meaning) => meaning.sourceDe === word.de && meaning.text.trim())
      .sort((a, b) => a.language.localeCompare(b.language));
    if (current.length === 0) return plain;
    return {
      ...plain,
      bedeutungen: Object.fromEntries(
        current.map((meaning) => [meaning.language, meaning.text])
      ),
    };
  };
}

/** Every approved meaning of the course's units, whatever German it was approved for. */
export async function approvedMeanings(
  client: pg.PoolClient,
  course: string
): Promise<ApprovedMeaning[]> {
  const { rows } = await client.query<{
    unit: number;
    word_id: string;
    language: MeaningDraftLanguage;
    source_de: string;
    text: string;
  }>(
    `select u.unit, d.word_id, d.language, d.source_de, d.text
       from content_meaning_drafts d
       join content_units u on u.id = d.unit_id
      where u.course = $1 and d.status = 'approved'`,
    [course]
  );
  return rows.map((row) => ({
    unit: row.unit,
    wordId: row.word_id,
    language: row.language,
    sourceDe: row.source_de,
    text: row.text,
  }));
}
