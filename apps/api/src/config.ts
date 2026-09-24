/**
 * Runtime configuration from environment variables (SUFFA_* prefix).
 *
 * Validation is strict in `prod`: the service refuses to start with missing, short or
 * placeholder secrets, so a half-configured CapRover app fails fast with a clear log line
 * instead of running insecurely (same policy as Tabayyun).
 */
import { z } from 'zod';
import type { SmtpSettings } from './auth/mailer.js';

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

const DSN = /^https?:\/\/[^@/\s]+@[^/\s]+\/\d+$/;

/** An optional Sentry-style DSN; blank counts as unset (CapRover keeps empty variables). */
function optionalDsn(name: string) {
  return z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .pipe(
      z
        .string()
        .regex(DSN, `${name} must look like https://<key>@<host>/<project id>`)
        .optional()
    )
    .optional();
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
  /** Public URL of the app (links in sign-in mails point here), e.g. https://suffa.example.org */
  SUFFA_PUBLIC_URL: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .pipe(z.string().url('SUFFA_PUBLIC_URL must be a URL').optional())
    .optional(),
  /** SMTP for sign-in mails: the Google Workspace relay (smtp-relay.gmail.com). */
  SUFFA_SMTP_HOST: z.string().trim().optional(),
  SUFFA_SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
  SUFFA_SMTP_USER: z.string().trim().optional(),
  SUFFA_SMTP_PASSWORD: z.string().optional(),
  SUFFA_MAIL_FROM: z.string().trim().optional(),
  SUFFA_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  SUFFA_VERSION: z.string().default('dev'),
  SUFFA_WORKER_HEARTBEAT_MS: z.coerce.number().int().min(1000).default(30_000),
  SUFFA_SYNC_DEV_TOKENS: z.string().optional(),
  /** GlitchTip/Sentry DSN of the suffa-api project; error reporting is off when unset. */
  SUFFA_ERROR_DSN: optionalDsn('SUFFA_ERROR_DSN'),
  /** DSN of the suffa-web project, handed to the PWA and used by the /api/errors tunnel. */
  SUFFA_WEB_ERROR_DSN: optionalDsn('SUFFA_WEB_ERROR_DSN'),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIN_DEV_TOKEN_LENGTH = 32;

/**
 * Parses `token=userUuid;token2=userUuid2` (development/test sync auth before Better Auth).
 * Returns the mapping and any problems found.
 */
export function parseDevTokens(spec: string): {
  tokens: Map<string, string>;
  issues: string[];
} {
  const tokens = new Map<string, string>();
  const issues: string[] = [];
  for (const entry of spec
    .split(';')
    .map((e) => e.trim())
    .filter(Boolean)) {
    const [token, userId] = entry.split('=').map((p) => p.trim());
    if (!token || token.length < MIN_DEV_TOKEN_LENGTH) {
      issues.push(
        `SUFFA_SYNC_DEV_TOKENS: tokens must be at least ${MIN_DEV_TOKEN_LENGTH} characters`
      );
    } else if (!userId || !UUID.test(userId)) {
      issues.push(
        'SUFFA_SYNC_DEV_TOKENS: each token must map to a user UUID (token=uuid)'
      );
    } else {
      tokens.set(token, userId.toLowerCase());
    }
  }
  return { tokens, issues };
}

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
  /** Static bearer tokens → user ids; only outside prod, until Better Auth (ADR-0008). */
  syncDevTokens: Map<string, string>;
  /** Error reporting (GlitchTip) DSN; undefined disables it. */
  errorDsn: string | undefined;
  /** Public URL of the app; sign-in is off without it (and without an auth secret). */
  publicUrl: string | undefined;
  /** SMTP for sign-in mails; outside prod the link may go to the log instead. */
  smtp: SmtpSettings | undefined;
  /** Public DSN of the web project; undefined disables browser error reporting. */
  webErrorDsn: string | undefined;
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
  // Host and sender go together; user and password are optional (the Workspace relay can
  // allow the server by IP) but also only together.
  const smtpComplete = Boolean(raw.SUFFA_SMTP_HOST && raw.SUFFA_MAIL_FROM);
  if (Boolean(raw.SUFFA_SMTP_HOST) !== Boolean(raw.SUFFA_MAIL_FROM)) {
    issues.push('SUFFA_SMTP_HOST and SUFFA_MAIL_FROM go together');
  }
  if (Boolean(raw.SUFFA_SMTP_USER) !== Boolean(raw.SUFFA_SMTP_PASSWORD)) {
    issues.push('SUFFA_SMTP_USER and SUFFA_SMTP_PASSWORD go together');
  }
  // Only the api signs people in; the worker needs neither mail nor the public URL.
  if (raw.SUFFA_ENV === 'prod' && raw.SUFFA_ROLE === 'api') {
    if (!raw.SUFFA_PUBLIC_URL) issues.push('SUFFA_PUBLIC_URL is required in prod');
    // Missing SMTP does not stop the service (existing deployments keep running); sign-in
    // simply stays off until it is configured, and the api logs that loudly.
  }
  let syncDevTokens = new Map<string, string>();
  if (raw.SUFFA_SYNC_DEV_TOKENS) {
    if (raw.SUFFA_ENV === 'prod') {
      issues.push('SUFFA_SYNC_DEV_TOKENS must not be set in prod');
    } else {
      const parsed = parseDevTokens(raw.SUFFA_SYNC_DEV_TOKENS);
      issues.push(...parsed.issues);
      syncDevTokens = parsed.tokens;
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
    syncDevTokens,
    errorDsn: raw.SUFFA_ERROR_DSN,
    publicUrl: raw.SUFFA_PUBLIC_URL?.replace(/\/$/, ''),
    smtp: smtpComplete
      ? {
          host: raw.SUFFA_SMTP_HOST!,
          port: raw.SUFFA_SMTP_PORT,
          auth:
            raw.SUFFA_SMTP_USER && raw.SUFFA_SMTP_PASSWORD
              ? { user: raw.SUFFA_SMTP_USER, password: raw.SUFFA_SMTP_PASSWORD }
              : undefined,
          from: raw.SUFFA_MAIL_FROM!,
          clientName: raw.SUFFA_PUBLIC_URL
            ? new URL(raw.SUFFA_PUBLIC_URL).hostname
            : undefined,
        }
      : undefined,
    webErrorDsn: raw.SUFFA_WEB_ERROR_DSN,
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
