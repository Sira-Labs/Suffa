import { describe, it, expect, beforeEach } from 'vitest';
import { AppDatabase } from '@/services/storage';
import { SyncEngine } from '@/services/sync';
import type {
  AuthListener,
  AuthState,
  PullResult,
  Result,
  SyncProvider,
  SyncableRecord,
} from '@/services/sync';
import type { SyncTable } from '@/types';
import { createCard } from '@/services/srs';

/**
 * In-memory provider that simulates a second "device"/backend. This lets us
 * integration-test the full offline-first cycle (outbox → push → pull → reconcile)
 * without a network.
 */
class FakeProvider implements SyncProvider {
  readonly name = 'fake';
  store: Record<string, Map<string, SyncableRecord>> = {};
  /** Server time of each stored record (the backend's watermark), an hour per write. */
  private stored = new Map<string, number>();
  private clock = Date.parse('2026-10-01T00:00:00.000Z');

  private stamp(table: SyncTable, id: string) {
    this.clock += 60 * 60 * 1000;
    this.stored.set(`${table}/${id}`, this.clock);
  }

  isConfigured(): boolean {
    return true;
  }
  getAuthState(): AuthState {
    return { status: 'signed-in', user: { id: 'u1', email: 'u1@test.de' } };
  }
  onAuthChange(_l: AuthListener): () => void {
    return () => undefined;
  }
  async signInWithEmail(): Promise<Result<void>> {
    return { ok: true, value: undefined };
  }
  async signOut(): Promise<Result<void>> {
    return { ok: true, value: undefined };
  }
  async push(table: SyncTable, records: SyncableRecord[]): Promise<Result<void>> {
    const bucket = (this.store[table] ??= new Map());
    for (const r of records) {
      bucket.set(r.id, { ...r });
      this.stamp(table, r.id);
    }
    return { ok: true, value: undefined };
  }
  async pull(table: SyncTable, since: string | null): Promise<Result<PullResult>> {
    const bucket = this.store[table] ?? new Map<string, SyncableRecord>();
    const after = since ? Date.parse(since) : -Infinity;
    const at = (r: SyncableRecord) => this.stored.get(`${table}/${r.id}`)!;
    const records = [...bucket.values()].filter((r) => at(r) > after);
    const newest = Math.max(...records.map(at));
    return {
      ok: true,
      value: {
        records,
        watermark: records.length > 0 ? new Date(newest).toISOString() : null,
      },
    };
  }

  /** Test helper: a record directly in the backend (another device). */
  seed(table: SyncTable, record: SyncableRecord) {
    (this.store[table] ??= new Map()).set(record.id, record);
    this.stamp(table, record.id);
  }
}

let dbA: AppDatabase;
let provider: FakeProvider;
let engine: SyncEngine;

beforeEach(async () => {
  provider = new FakeProvider();
  dbA = new AppDatabase(`test-sync-${Math.random().toString(36).slice(2)}`);
  await dbA.open();
  engine = new SyncEngine(provider, dbA);
});

describe('SyncEngine integration: offline queue → push → pull → reconcile', () => {
  it('pushes local outbox records to the backend and empties the queue', async () => {
    const card = createCard({ id: 'srs1', contentRef: 'v-ism', kind: 'vocab_ar_de' });
    await dbA.srs_cards.put(card);
    await dbA.outbox.add({
      table: 'srs_cards',
      recordId: 'srs1',
      queuedAt: new Date().toISOString(),
    });

    const result = await engine.sync();

    expect(result.pushed).toBe(1);
    expect(provider.store.srs_cards?.get('srs1')).toBeDefined();
    expect(await dbA.outbox.count()).toBe(0);
  });

  it('pulls remote records from another device and writes them locally', async () => {
    provider.seed('user_vocab', {
      id: 'uv1',
      ar: 'كِتاب',
      tr: 'kitāb',
      de: 'Buch',
      wurzel: 'ك-ت-ب',
      einheit: 1,
      updated_at: '2026-06-12T00:00:00.000Z',
      deleted: false,
    });

    const result = await engine.sync();

    expect(result.pulled).toBe(1);
    const local = await dbA.user_vocab.get('uv1');
    expect(local?.de).toBe('Buch');
  });

  it('resolves conflicts via last-write-wins (newer remote wins)', async () => {
    const older = createCard({
      id: 'srs2',
      contentRef: 'v-hal',
      kind: 'vocab_ar_de',
      now: new Date('2026-06-10T00:00:00.000Z'),
    });
    await dbA.srs_cards.put(older);
    await dbA.outbox.add({
      table: 'srs_cards',
      recordId: 'srs2',
      queuedAt: older.updated_at,
    });

    // Another device later updated the same card with reps=9.
    provider.seed('srs_cards', {
      ...older,
      reps: 9,
      updated_at: '2026-06-13T00:00:00.000Z',
    } as unknown as SyncableRecord);

    await engine.sync();

    const local = await dbA.srs_cards.get('srs2');
    expect(local?.reps).toBe(9);
  });

  it('is idempotent: a second sync without changes does nothing', async () => {
    const card = createCard({ id: 'srs3', contentRef: 'v-ism', kind: 'plural' });
    await dbA.srs_cards.put(card);
    await dbA.outbox.add({
      table: 'srs_cards',
      recordId: 'srs3',
      queuedAt: card.updated_at,
    });

    await engine.sync();
    const second = await engine.sync();

    expect(second.pushed).toBe(0);
    expect(second.pulled).toBe(0);
  });

  it('keeps the outbox when the push fails (no data loss)', async () => {
    provider.push = async () => ({
      ok: false,
      error: { code: 'network', message: 'offline' },
    });
    const card = createCard({ id: 'srs4', contentRef: 'v-ism', kind: 'vocab_de_ar' });
    await dbA.srs_cards.put(card);
    await dbA.outbox.add({
      table: 'srs_cards',
      recordId: 'srs4',
      queuedAt: card.updated_at,
    });

    const result = await engine.sync();

    expect(result.pushed).toBe(0);
    expect(await dbA.outbox.count()).toBe(1);
  });
});
