/**
 * Runtime configuration from environment variables (SUFFA_* prefix).
 *
 * Validation is strict in `prod`: the service refuses to start with missing, short or
 * placeholder secrets, so a half-configured CapRover app fails fast with a clear log line
 * instead of running insecurely (same policy as Tabayyun).
 */
import { z } from 'zod';

const PLACEHOLDER_VALUES = new Set([
  'change-me',
  'changeme',
  'secret',
  'password',
  'suffa',
]);
const MIN_SECRET_LENGTH = 32;

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`invalid configuration: ${issues.join('; ')}`);
    this.name = 'ConfigError';
  }
}

const RawEnvSchema = z.object({
  SUFFA_ENV: z.enum(['dev', 'test', 'prod']).default('dev'),
  SUFFA_ROLE: z.enum(['api', 'worker']).default('api'),
  SUFFA_PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  SUFFA_DATABASE_URL: z
    .string({ required_error: 'SUFFA_DATABASE_URL is required' })
    .regex(/^postgres(ql)?:\/\/.+/, 'SUFFA_DATABASE_URL must be a postgres:// URL'),
  SUFFA_DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  SUFFA_AUTH_SECRET: z.string().optional(),
  SUFFA_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  SUFFA_VERSION: z.string().default('dev'),
  SUFFA_WORKER_HEARTBEAT_MS: z.coerce.number().int().min(1000).default(30_000),
});

export interface Config {
  env: 'dev' | 'test' | 'prod';
  role: 'api' | 'worker';
  port: number;
  databaseUrl: string;
  dbPoolMax: number;
  authSecret: string | undefined;
  logLevel: string;
  version: string;
  workerHeartbeatMs: number;
}

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_VALUES.has(value.trim().toLowerCase());
}

function databasePassword(url: string): string | null {
  try {
    const password = new URL(url).password;
    return password ? decodeURIComponent(password) : null;
  } catch {
    // A syntactically broken URL is reported by the schema/driver; nothing to inspect here.
    return null;
  }
}

/** Parses and validates configuration; throws `ConfigError` listing every problem. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = RawEnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`)
    );
  }
  const raw = parsed.data;
  const issues: string[] = [];

  if (raw.SUFFA_ENV === 'prod') {
    const secret = raw.SUFFA_AUTH_SECRET;
    if (!secret) issues.push('SUFFA_AUTH_SECRET is required in prod');
    else if (secret.length < MIN_SECRET_LENGTH || isPlaceholder(secret)) {
      issues.push(
        `SUFFA_AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} random characters`
      );
    }
    const password = databasePassword(raw.SUFFA_DATABASE_URL);
    if (!password || password.length < 16 || isPlaceholder(password)) {
      issues.push(
        'SUFFA_DATABASE_URL must contain a generated password (>= 16 chars) in prod'
      );
    }
  }
  if (issues.length > 0) throw new ConfigError(issues);

  return {
    env: raw.SUFFA_ENV,
    role: raw.SUFFA_ROLE,
    port: raw.SUFFA_PORT,
    databaseUrl: raw.SUFFA_DATABASE_URL,
    dbPoolMax: raw.SUFFA_DB_POOL_MAX,
    authSecret: raw.SUFFA_AUTH_SECRET,
    logLevel: raw.SUFFA_LOG_LEVEL,
    version: raw.SUFFA_VERSION,
    workerHeartbeatMs: raw.SUFFA_WORKER_HEARTBEAT_MS,
  };
}

/** Database URL with the password masked, for logs. */
export function redactDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '<unparseable database url>';
  }
}
