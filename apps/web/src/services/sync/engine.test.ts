/**
 * Two devices, one account: the sync engine must never lose learning progress, whichever
 * device syncs first (regression: the phone's reviews were replaced by cards the desktop had
 * merely created).
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { SrsCard, SyncTable } from '@/types';
import { AppDatabase, cardRepo, reviewLogRepo } from '@/services/storage';
import { createCard, schedule } from '@/services/srs';
import { SyncEngine } from './engine';
import type { Result, SyncProvider, SyncableRecord } from './provider';

type Row = SyncableRecord & { lastReviewed?: string | null };

/** In-memory server with the same acceptance rule as the API's upsert. */
class FakeServer {
  tables = new Map<SyncTable, Map<string, Row>>();

  private table(name: SyncTable) {
    let t = this.tables.get(name);
    if (!t) this.tables.set(name, (t = new Map()));
    return t;
  }

  push(name: SyncTable, records: Row[]) {
    const t = this.table(name);
    for (const incoming of records) {
      const stored = t.get(incoming.id);
      const reviewed = (r?: Row) =>
        r?.lastReviewed ? Date.parse(r.lastReviewed) : -Infinity;
      const newer = !stored || stored.updated_at < incoming.updated_at;
      const accept =
        name === 'srs_cards' && stored
          ? reviewed(incoming) > reviewed(stored) ||
            (reviewed(incoming) === reviewed(stored) && newer)
          : newer;
      if (accept) t.set(incoming.id, { ...incoming });
    }
  }

  pull(name: SyncTable, since: string | null): Row[] {
    return [...this.table(name).values()]
      .filter((r) => !since || r.updated_at > since)
      .map((r) => ({ ...r }));
  }

  card(id: string) {
    return this.table('srs_cards').get(id) as (Row & SrsCard) | undefined;
  }
}

function device(server: FakeServer) {
  const ok = <T>(value: T): Result<T> => ({ ok: true, value });
  const provider: SyncProvider = {
    name: 'fake',
    isConfigured: () => true,
    getAuthState: () => ({
      status: 'signed-in',
      user: { id: 'u', email: 'u@example.org' },
    }),
    onAuthChange: () => () => {},
    signInWithEmail: async () => ok(undefined),
    signOut: async () => ok(undefined),
    push: async (table, records) => {
      server.push(table, records as Row[]);
      return ok(undefined);
    },
    pull: async (table, since) => ok(server.pull(table, since)),
  };
  return provider;
}

const ID = 'vocab_ar_de:v-bayt';
const seed = (at: string) =>
  createCard({ id: ID, contentRef: 'v-bayt', kind: 'vocab_ar_de', now: new Date(at) });

async function review(database: AppDatabase, card: SrsCard, at: string) {
  const updated = schedule(card, 'good', { now: new Date(at), fuzz: 0 });
  await cardRepo.put(updated, database);
  await reviewLogRepo.add(
    {
      cardId: ID,
      contentRef: 'v-bayt',
      kind: 'vocab_ar_de',
      rating: 'good',
      durationMs: 900,
      scheduledInterval: updated.interval,
      reviewedAt: at,
    },
    database
  );
  return updated;
}

const databases: AppDatabase[] = [];
function newDatabase(name: string) {
  const database = new AppDatabase(`${name}-${Math.random()}`);
  databases.push(database);
  return database;
}

afterEach(async () => {
  for (const database of databases.splice(0)) await database.delete();
});

describe('SyncEngine across two devices', () => {
  it('keeps the phone’s reviews when the desktop created the same cards later', async () => {
    const server = new FakeServer();
    const phone = newDatabase('phone');
    const desktop = newDatabase('desktop');

    // Phone: card created and reviewed twice, days ago.
    let card = seed('2026-09-01T08:00:00.000Z');
    await cardRepo.put(card, phone);
    card = await review(phone, card, '2026-09-02T08:00:00.000Z');
    await review(phone, card, '2026-09-03T08:00:00.000Z');
    // Desktop: the same card merely created (fresh updated_at), synced first.
    await cardRepo.put(seed('2026-09-24T08:00:00.000Z'), desktop);
    await new SyncEngine(device(server), desktop).sync();

    await new SyncEngine(device(server), phone).sync();

    expect((await cardRepo.get(ID, phone))?.reps).toBe(2);
    expect(server.card(ID)?.reps).toBe(2);
    // The desktop gets the progress on its next sync.
    await new SyncEngine(device(server), desktop).sync();
    expect((await cardRepo.get(ID, desktop))?.reps).toBe(2);
  });

  it('rebuilds a card that was already overwritten, from the review logs', async () => {
    const server = new FakeServer();
    const phone = newDatabase('phone');

    // The broken state after the old sync: the card is back to "never reviewed", but the
    // review logs of both reviews are on the device (and the server).
    let card = seed('2026-09-01T08:00:00.000Z');
    card = await review(phone, card, '2026-09-02T08:00:00.000Z');
    await review(phone, card, '2026-09-03T08:00:00.000Z');
    await cardRepo.put(seed('2026-09-24T08:00:00.000Z'), phone);

    const result = await new SyncEngine(device(server), phone).sync();

    expect(result.repaired).toBe(1);
    const repaired = await cardRepo.get(ID, phone);
    expect(repaired).toMatchObject({ reps: 2, lastReviewed: '2026-09-03T08:00:00.000Z' });
    expect(server.card(ID)?.reps).toBe(2);
    // A second sync has nothing left to repair.
    expect((await new SyncEngine(device(server), phone).sync()).repaired).toBe(0);
  });
});
