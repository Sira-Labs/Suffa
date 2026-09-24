import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { AppDatabase, PROGRESS_TABLES } from './db';

/** The schema as it was before progress joined sync (Dexie version 6). */
async function createVersion6(name: string) {
  const old = new Dexie(name);
  old.version(6).stores({
    srs_cards: 'id, contentRef, kind, due, updated_at, deleted, leech',
    review_logs: 'id, cardId, reviewedAt, updated_at, deleted',
    exam_results: 'id, format, finishedAt, updated_at, deleted',
    settings: 'id, key, updated_at, deleted',
    user_vocab: 'id, wurzel, einheit, updated_at, deleted',
    outbox: '++seq, table, recordId, queuedAt',
    sync_meta: 'key',
    media_progress: 'id, lessonKey, completedAt, updated_at, deleted',
    practice_progress: 'id, unit, skill, updated_at, deleted',
    unit_enrollments: 'id, unit, updated_at, deleted',
    daily_checkins: 'id, updated_at, deleted',
    discover_progress: 'id, openedAt, updated_at, deleted',
  });
  await old.open();
  const base = { updated_at: '2026-09-20T10:00:00.000Z', deleted: false };
  await old.table('practice_progress').bulkPut([
    { ...base, id: '1:read:d-1-1', unit: 1, skill: 'read', itemId: 'd-1-1' },
    { ...base, id: '1:write:w-1', unit: 1, skill: 'write', itemId: 'w-1' },
  ]);
  await old.table('unit_enrollments').put({ ...base, id: 'b1-u2', unit: 2 });
  await old.table('daily_checkins').put({ ...base, id: '2026-09-20', wordId: 'v-1' });
  await old.table('srs_cards').put({ ...base, id: 'card-1' });
  old.close();
}

describe('schema version 7', () => {
  it('queues the progress a device already has, so it reaches the account', async () => {
    const name = `upgrade-${Math.random()}`;
    await createVersion6(name);

    const database = new AppDatabase(name);
    const queued = await database.outbox.toArray();
    await database.delete();

    expect(queued.map((e) => `${e.table}/${e.recordId}`).sort()).toEqual([
      'daily_checkins/2026-09-20',
      'practice_progress/1:read:d-1-1',
      'practice_progress/1:write:w-1',
      'unit_enrollments/b1-u2',
    ]);
    expect(PROGRESS_TABLES).toContain('media_progress');
  });
});
