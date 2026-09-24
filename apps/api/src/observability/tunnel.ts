/**
 * Browser error reporting through our own origin (sprint story 2.4):
 *
 *   GET  /api/client-config   → { errorDsn } for the PWA (a DSN is public by design)
 *   POST /api/errors          → forwards a Sentry envelope to GlitchTip
 *
 * Why a tunnel: ad blockers drop requests to error-tracking endpoints, the CSP can stay at
 * `connect-src 'self'`, and GlitchTip never sees the learner's IP address.
 * Only envelopes addressed to the configured web DSN are forwarded, bodies are capped and a
 * per-process rate limit protects GlitchTip from floods.
 */
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

const MAX_ENVELOPE_BYTES = 256 * 1024;
const UPSTREAM_TIMEOUT_MS = 5000;

export interface ParsedDsn {
  origin: string;
  publicKey: string;
  projectId: string;
}

export function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, '');
    if (!url.username || !/^\d+$/.test(projectId)) return null;
    return { origin: url.origin, publicKey: url.username, projectId };
  } catch {
    return null;
  }
}

/** Fixed-window counter: at most `limit` calls per `windowMs`. */
export class RateLimiter {
  private windowStart = 0;
  private count = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now
  ) {}

  tryTake(): boolean {
    const now = this.now();
    if (now - this.windowStart >= this.windowMs) {
      this.windowStart = now;
      this.count = 0;
    }
    if (this.count >= this.limit) return false;
    this.count += 1;
    return true;
  }
}

export interface ErrorTunnelDeps {
  webDsn: string | undefined;
  /** Injected for tests. */
  fetch?: typeof fetch;
  limiter?: RateLimiter;
  log: { warn(obj: object, msg: string): void };
}

export function createErrorTunnel(deps: ErrorTunnelDeps): Hono {
  const app = new Hono();
  const target = deps.webDsn ? parseDsn(deps.webDsn) : null;
  const doFetch = deps.fetch ?? fetch;
  const limiter = deps.limiter ?? new RateLimiter(120, 60_000);

  app.get('/client-config', (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({ errorDsn: target ? deps.webDsn : null });
  });

  app.post(
    '/errors',
    bodyLimit({
      maxSize: MAX_ENVELOPE_BYTES,
      onError: (c) => c.json({ error: 'payload_too_large' }, 413),
    }),
    async (c) => {
      if (!target) return c.json({ error: 'error_tracking_disabled' }, 404);
      const body = await c.req.text();
      // An envelope starts with one JSON header line that names the DSN.
      const newline = body.indexOf('\n');
      const headerLine = newline === -1 ? body : body.slice(0, newline);
      let header: { dsn?: unknown };
      try {
        header = JSON.parse(headerLine) as { dsn?: unknown };
      } catch {
        return c.json({ error: 'invalid_envelope' }, 400);
      }
      const sent = typeof header.dsn === 'string' ? parseDsn(header.dsn) : null;
      if (
        !sent ||
        sent.origin !== target.origin ||
        sent.projectId !== target.projectId ||
        sent.publicKey !== target.publicKey
      ) {
        return c.json({ error: 'unknown_dsn' }, 403);
      }
      if (!limiter.tryTake()) return c.json({ error: 'rate_limited' }, 429);

      const url = `${target.origin}/api/${target.projectId}/envelope/?sentry_key=${encodeURIComponent(target.publicKey)}`;
      try {
        const upstream = await doFetch(url, {
          method: 'POST',
          body,
          headers: { 'Content-Type': 'application/x-sentry-envelope' },
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        });
        return c.body(null, upstream.ok ? 200 : 502);
      } catch (error) {
        deps.log.warn({ err: error }, 'errors.tunnel_failed');
        return c.body(null, 502);
      }
    }
  );

  return app;
}
