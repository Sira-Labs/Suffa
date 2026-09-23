/**
 * Lean structured logging.
 *
 * - Uniform JSON-like format with scope, level, time and context.
 * - In production `debug`/`info` are suppressed; `warn`/`error` remain.
 * - No external dependencies; testable and tree-shakable.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const isProd = import.meta.env?.PROD ?? false;

/** Receives all `error` entries (e.g. error tracking), regardless of log level. */
export type ErrorSink = (
  scope: string,
  message: string,
  context?: Record<string, unknown>
) => void;

let errorSink: ErrorSink | null = null;

export function setErrorSink(sink: ErrorSink | null): void {
  errorSink = sink;
}
const minLevel: LogLevel = isProd ? 'warn' : 'debug';

export interface Logger {
  child(scope: string): Logger;
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

function emit(
  scope: string,
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>
): void {
  if (level === 'error') errorSink?.(scope, message, context);
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    ...(context ? { context } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  // eslint-disable-next-line no-console
  else console.log(line);
}

function makeLogger(scope: string): Logger {
  return {
    child: (sub: string) => makeLogger(`${scope}:${sub}`),
    debug: (m, c) => emit(scope, 'debug', m, c),
    info: (m, c) => emit(scope, 'info', m, c),
    warn: (m, c) => emit(scope, 'warn', m, c),
    error: (m, c) => emit(scope, 'error', m, c),
  };
}

export const logger = makeLogger('app');
