/** Links between AI suggestions and what they became (story 11.4). */
import type pg from 'pg';

/**
 * The teacher removed a chapter or checkpoint that came from an AI suggestion: the suggestion
 * is open again, so it can be taken over later.
 */
export async function reopenSuggestion(
  pool: Pick<pg.Pool, 'query'>,
  mediaId: string,
  resultId: string
): Promise<void> {
  await pool.query(
    `update media_suggestions
        set status = 'pending', decided_by = null, decided_at = null, result_id = null
      where media_id = $1 and result_id = $2`,
    [mediaId, resultId]
  );
}
