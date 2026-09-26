/** Links between AI suggestions and what they became (story 11.4). */
import type pg from 'pg';

/**
 * Deletes a checkpoint or chapter and, in the same statement, puts the AI suggestion it came
 * from back up for decision. Returns false when there was nothing to delete.
 */
export async function removeAndReopen(
  pool: Pick<pg.Pool, 'query'>,
  table: 'media_checkpoints' | 'media_chapters',
  mediaId: string,
  id: string
): Promise<boolean> {
  const { rows } = await pool.query(
    `with removed as (
       delete from ${table} where media_id = $1 and id = $2 returning id
     ), reopened as (
       update media_suggestions
          set status = 'pending', decided_by = null, decided_at = null, result_id = null
        where media_id = $1 and result_id in (select id from removed)
       returning id
     )
     select count(*)::int as n from removed`,
    [mediaId, id]
  );
  return (rows[0]?.n ?? 0) > 0;
}
