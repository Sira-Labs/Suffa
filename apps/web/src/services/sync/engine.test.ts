/**
 * Two devices, one account: the sync engine must never lose learning progress, whichever
 * device syncs first (regression: the phone's reviews were replaced by cards the desktop had
 * merely created).
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { SrsCard, SyncTable } from '@/types';
import {
  AppDatabase,
  cardRepo,
  discoverRepo,
  practiceRepo,
  reviewLogRepo,
} from '@/services/storage';
import { createCard, schedule } from '@/services/srs';
import { SyncEngine } from './engine';
import type { Result, SyncProvider, SyncableRecord } from './provider';

type Row = SyncableRecord & { lastReviewed?: string | null };

/**
 * In-memory server with the API's acceptance rule and its server-time watermark: every stored
 * record gets the server's own change time (synced_at), and pulls go by that time.
 */
class FakeServer {
  tables = new Map<SyncTable, Map<string, Row>>();
  private syncedAt = new Map<string, number>();
  private clock = Date.parse('2026-10-01T00:00:00.000Z');

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
      if (accept) {
        t.set(incoming.id, { ...incoming });
        // Server time moves on by a minute per write, far beyond the pull overlap.
        this.clock += 60 * 60 * 1000;
        this.syncedAt.set(`${name}/${incoming.id}`, this.clock);
      }
    }
  }

  pull(
    name: SyncTable,
    since: string | null
  ): { records: Row[]; watermark: string | null } {
    const after = since ? Date.parse(since) : -Infinity;
    const rows = [...this.table(name).values()]
      .map((r) => ({ r, at: this.syncedAt.get(`${name}/${r.id}`)! }))
      .filter(({ at }) => at > after)
      .sort((a, b) => a.at - b.at);
    const last = rows.at(-1);
    return {
      records: rows.map(({ r }) => ({ ...r })),
      watermark: last ? new Date(last.at).toISOString() : null,
    };
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

  it('brings unit practice and "Entdecken" progress to the other device', async () => {
    const server = new FakeServer();
    const phone = newDatabase('phone');
    const desktop = newDatabase('desktop');
    await practiceRepo.put(
      {
        id: '4:write:w-4-2',
        unit: 4,
        skill: 'write',
        itemId: 'w-4-2',
        practisedAt: '2026-09-23T18:00:00.000Z',
        updated_at: '',
        deleted: false,
      },
      phone
    );
    await discoverRepo.put(
      {
        id: 'yt/abc',
        startedAt: null,
        openedAt: '2026-09-23T18:00:00.000Z',
        pinned: true,
        updated_at: '',
        deleted: false,
      },
      phone
    );

    await new SyncEngine(device(server), phone).sync();
    await new SyncEngine(device(server), desktop).sync();

    expect((await practiceRepo.all(desktop)).map((p) => p.id)).toEqual(['4:write:w-4-2']);
    const [pinned] = await discoverRepo.all(desktop);
    // Absent optional fields stay absent (the server answers them as null).
    expect(pinned).toMatchObject({ id: 'yt/abc', pinned: true });
    expect('positionSec' in pinned!).toBe(false);
  });

  it('pulls what another device uploads later, however old its timestamps', async () => {
    const server = new FakeServer();
    const phone = newDatabase('phone');
    const desktop = newDatabase('desktop');
    const practised = (id: string, at: string) => ({
      id,
      unit: 1,
      skill: 'read' as const,
      itemId: id,
      practisedAt: at,
      updated_at: '',
      deleted: false,
    });
    await practiceRepo.put(practised('1:read:phone', '2026-09-24T14:00:00.000Z'), phone);
    await new SyncEngine(device(server), phone).sync();

    // The desktop's record is from last week, uploaded only now.
    await desktop.practice_progress.put({
      ...practised('1:read:desktop', '2026-09-17T09:00:00.000Z'),
      updated_at: '2026-09-17T09:00:00.000Z',
    });
    await desktop.outbox.add({
      table: 'practice_progress',
      recordId: '1:read:desktop',
      queuedAt: '2026-09-17T09:00:00.000Z',
    });
    await new SyncEngine(device(server), desktop).sync();

    await new SyncEngine(device(server), phone).sync();
    expect((await practiceRepo.all(phone)).map((p) => p.id).sort()).toEqual([
      '1:read:desktop',
      '1:read:phone',
    ]);
  });
});
