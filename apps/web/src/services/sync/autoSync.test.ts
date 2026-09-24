import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startAutoSync } from './autoSync';

class FakeDoc extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible';
}

function setup(overrides: { signedIn?: boolean; pending?: number } = {}) {
  const doc = new FakeDoc();
  const target = new EventTarget();
  const sync = vi.fn(async () => {});
  let pending = overrides.pending ?? 0;
  const stop = startAutoSync({
    sync,
    isSignedIn: () => overrides.signedIn ?? true,
    pending: async () => pending,
    intervalMs: 5 * 60_000,
    pendingCheckMs: 60_000,
    minGapMs: 30_000,
    now: () => Date.now(),
    target: target as unknown as Window,
    document: doc as unknown as Document,
  });
  return {
    doc,
    target,
    sync,
    stop,
    setPending: (n: number) => {
      pending = n;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-24T12:00:00.000Z'));
});
afterEach(() => vi.useRealTimers());

describe('startAutoSync', () => {
  it('syncs when the app comes back to the foreground', async () => {
    const { doc, sync, stop } = setup();
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(sync).not.toHaveBeenCalled();
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(sync).toHaveBeenCalledTimes(1);
    stop();
  });

  it('throttles: focus right after a sync does not sync again', async () => {
    const { target, sync, stop } = setup();
    target.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    target.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(10_000);
    target.dispatchEvent(new Event('focus'));
    expect(sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    target.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(sync).toHaveBeenCalledTimes(2);
    stop();
  });

  it('syncs every five minutes while visible, and not while hidden', async () => {
    const { doc, sync, stop } = setup();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(sync).toHaveBeenCalledTimes(1);
    doc.visibilityState = 'hidden';
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(sync).toHaveBeenCalledTimes(1);
    stop();
  });

  it('uploads queued local changes within a minute', async () => {
    const { sync, setPending, stop } = setup();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sync).not.toHaveBeenCalled();
    setPending(3);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sync).toHaveBeenCalledTimes(1);
    stop();
  });

  it('does nothing when signed out, and stops cleanly', async () => {
    const signedOut = setup({ signedIn: false, pending: 5 });
    signedOut.target.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(signedOut.sync).not.toHaveBeenCalled();
    signedOut.stop();

    const stopped = setup();
    stopped.stop();
    stopped.target.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(stopped.sync).not.toHaveBeenCalled();
  });
});
