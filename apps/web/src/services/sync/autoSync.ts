/**
 * Keeps devices in step without a sync button: syncs when the app comes to the foreground,
 * every few minutes while it is visible, and soon after local changes are queued. Throttled,
 * so switching tabs back and forth does not hammer the server.
 */

export interface AutoSyncOptions {
  /** Runs one sync cycle (errors are handled by the caller's store). */
  sync(): Promise<void>;
  /** Only signed-in users sync. */
  isSignedIn(): boolean;
  /** Local changes waiting for upload (outbox size). */
  pending(): Promise<number>;
  /** Full sync interval while visible. */
  intervalMs?: number;
  /** How often to look for queued local changes. */
  pendingCheckMs?: number;
  /** Minimum gap between two automatic syncs. */
  minGapMs?: number;
  now?: () => number;
  target?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  document?: Pick<
    Document,
    'addEventListener' | 'removeEventListener' | 'visibilityState'
  >;
}

export const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;
export const PENDING_CHECK_MS = 60 * 1000;
export const MIN_SYNC_GAP_MS = 30 * 1000;

/** Starts automatic syncing; returns a function that stops it. */
export function startAutoSync(options: AutoSyncOptions): () => void {
  const now = options.now ?? (() => Date.now());
  const target = options.target ?? window;
  const doc = options.document ?? document;
  const minGap = options.minGapMs ?? MIN_SYNC_GAP_MS;
  let last = Number.NEGATIVE_INFINITY;
  let running = false;

  const visible = () => doc.visibilityState !== 'hidden';

  const run = async () => {
    if (running || !options.isSignedIn() || !visible()) return;
    if (now() - last < minGap) return;
    running = true;
    last = now();
    try {
      await options.sync();
    } finally {
      running = false;
    }
  };

  const onForeground = () => {
    if (visible()) void run();
  };

  const syncTimer = setInterval(
    () => void run(),
    options.intervalMs ?? AUTO_SYNC_INTERVAL_MS
  );
  const pendingTimer = setInterval(() => {
    void options.pending().then((count) => {
      if (count > 0) void run();
    });
  }, options.pendingCheckMs ?? PENDING_CHECK_MS);

  doc.addEventListener('visibilitychange', onForeground);
  target.addEventListener('focus', onForeground);

  return () => {
    clearInterval(syncTimer);
    clearInterval(pendingTimer);
    doc.removeEventListener('visibilitychange', onForeground);
    target.removeEventListener('focus', onForeground);
  };
}
