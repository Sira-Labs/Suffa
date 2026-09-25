/**
 * Typed gateway errors. Adapters map every provider failure to one kind, so the router decides
 * retry/fallback without string matching.
 */
import type { ProviderId } from './types.js';

export type LlmErrorKind =
  | 'rate_limited'
  | 'overloaded'
  | 'server'
  | 'network'
  | 'timeout'
  | 'auth'
  | 'not_found'
  | 'bad_request'
  | 'aborted';

/** Kinds where another provider or model may well succeed. */
const FALLBACKABLE: ReadonlySet<LlmErrorKind> = new Set([
  'rate_limited',
  'overloaded',
  'server',
  'network',
  'timeout',
  'auth',
  'not_found',
]);

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    readonly provider: ProviderId,
    message: string,
    readonly status?: number,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = 'LlmError';
  }

  get fallbackable(): boolean {
    return FALLBACKABLE.has(this.kind);
  }
}

/** Maps an HTTP status to an error kind (shared by the HTTP adapters). */
export function kindForStatus(status: number): LlmErrorKind {
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 408) return 'timeout';
  if (status === 503 || status === 529) return 'overloaded';
  if (status >= 500) return 'server';
  return 'bad_request';
}
