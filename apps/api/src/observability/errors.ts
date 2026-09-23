/**
 * Error reporting to GlitchTip (Sentry protocol, sprint story 2.4).
 *
 * - Off unless SUFFA_ERROR_DSN is set: the disabled reporter is a no-op, so tests and local
 *   development need nothing.
 * - Only errors, no tracing: built on `@sentry/core` (no dependencies) with the Node stack
 *   parser and a plain `fetch` transport. The full Node SDKs pull in OpenTelemetry and patch
 *   `pg`/`http`, which we do not need. Every event carries the release (`sha-…`),
 *   environment and role.
 * - No personal data leaves the server: every data-collection category is off, and request
 *   headers, cookies, query strings and bodies are dropped again before sending.
 */
import { hostname } from 'node:os';
import {
  applySdkMetadata,
  captureException,
  createStackParser,
  createTransport,
  dedupeIntegration,
  flush,
  initAndBind,
  linkedErrorsIntegration,
  withScope,
  type BaseTransportOptions,
  type DataCollection,
  type ErrorEvent,
  type Transport,
} from '@sentry/core';
import {
  nodeStackLineParser,
  ServerRuntimeClient,
  type ServerRuntimeClientOptions,
} from '@sentry/core/server';

export type ErrorContext = Record<string, string | number | boolean | undefined>;

export interface ErrorReporter {
  readonly enabled: boolean;
  /** Reports an error; never throws. */
  capture(error: unknown, context?: ErrorContext): void;
  /** Sends pending events, e.g. before the process exits. */
  flush(timeoutMs?: number): Promise<void>;
}

export const disabledReporter: ErrorReporter = {
  enabled: false,
  capture: () => undefined,
  flush: async () => undefined,
};

/** Nothing about learners or requests is collected; errors and stack traces only. */
export const NO_DATA_COLLECTION: DataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  databaseQueryData: false,
  stackFrameVariables: false,
};

export interface ErrorReporterOptions {
  dsn: string | undefined;
  release: string;
  environment: string;
  role: 'api' | 'worker';
}

/** Removes data that could identify a learner or leak credentials. */
export function scrubEvent<E extends ErrorEvent>(event: E): E {
  if (event.request) {
    delete event.request.headers;
    delete event.request.cookies;
    delete event.request.query_string;
    delete event.request.data;
  }
  delete event.user;
  return event;
}

/** Sends envelopes with the built-in fetch; honours rate-limit headers via createTransport. */
export function fetchTransport(options: BaseTransportOptions): Transport {
  return createTransport(options, async (request) => {
    const response = await fetch(options.url, {
      method: 'POST',
      body: request.body,
      headers: options.headers,
      signal: AbortSignal.timeout(5000),
    });
    return {
      statusCode: response.status,
      headers: {
        'x-sentry-rate-limits': response.headers.get('x-sentry-rate-limits'),
        'retry-after': response.headers.get('retry-after'),
      },
    };
  });
}

export function createErrorReporter(opts: ErrorReporterOptions): ErrorReporter {
  if (!opts.dsn) return disabledReporter;
  const options: ServerRuntimeClientOptions = {
    dsn: opts.dsn,
    release: opts.release,
    environment: opts.environment,
    serverName: hostname(),
    platform: 'node',
    runtime: { name: 'node', version: process.version },
    dataCollection: NO_DATA_COLLECTION,
    stackParser: createStackParser(nodeStackLineParser()),
    transport: fetchTransport,
    integrations: [dedupeIntegration(), linkedErrorsIntegration()],
    initialScope: { tags: { role: opts.role } },
    beforeSend: (event) => scrubEvent(event),
  };
  applySdkMetadata(options, 'node');
  initAndBind(ServerRuntimeClient, options);
  return {
    enabled: true,
    capture(error, context) {
      withScope((scope) => {
        if (context) scope.setExtras(context);
        captureException(error);
      });
    },
    async flush(timeoutMs = 2000) {
      await flush(timeoutMs);
    },
  };
}
