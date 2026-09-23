import { describe, it, expect, beforeEach } from 'vitest';
import { AppDatabase } from '@/services/storage';
import { SyncEngine } from '@/services/sync';
import type {
  AuthListener,
  AuthState,
  Result,
  SyncProvider,
  SyncableRecord,
} from '@/services/sync';
import type { SyncTable } from '@/types';
import { createCard } from '@/services/srs';

/**
 * In-Memory-Provider, der ein zweites „Gerät“/Backend simuliert. So lässt sich
 * der komplette Offline-first-Zyklus (Outbox → push → pull → reconcile) ohne
 * Netzwerk integrativ testen.
 */
class FakeProvider implements SyncProvider {
  readonly name = 'fake';
  store: Record<string, Map<string, SyncableRecord>> = {};

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
    for (const r of records) bucket.set(r.id, { ...r });
    return { ok: true, value: undefined };
  }
  async pull(table: SyncTable, since: string | null): Promise<Result<SyncableRecord[]>> {
    const bucket = this.store[table] ?? new Map();
    const all = [...bucket.values()];
    const filtered = since ? all.filter((r) => r.updated_at > since) : all;
    return { ok: true, value: filtered };
  }

  /** Test-Helfer: ein Datensatz direkt im Backend (anderes Gerät). */
  seed(table: SyncTable, record: SyncableRecord) {
    (this.store[table] ??= new Map()).set(record.id, record);
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

describe('SyncEngine Integration: Offline-Queue → push → pull → reconcile', () => {
  it('pusht lokale Outbox-Datensätze ans Backend und leert die Queue', async () => {
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

  it('zieht Remote-Datensätze eines anderen Geräts und schreibt sie lokal', async () => {
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

  it('löst Konflikte per Last-Write-Wins (neuerer Remote gewinnt)', async () => {
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

    // Anderes Gerät hat dieselbe Karte später mit reps=9 aktualisiert.
    provider.seed('srs_cards', {
      ...older,
      reps: 9,
      updated_at: '2026-06-13T00:00:00.000Z',
    } as unknown as SyncableRecord);

    await engine.sync();

    const local = await dbA.srs_cards.get('srs2');
    expect(local?.reps).toBe(9);
  });

  it('ist idempotent: ein zweiter Sync ohne Änderungen tut nichts', async () => {
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

  it('behält die Outbox, wenn der Push fehlschlägt (kein Datenverlust)', async () => {
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
