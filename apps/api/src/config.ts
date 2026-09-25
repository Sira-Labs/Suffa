/**
 * Runtime configuration from environment variables (SUFFA_* prefix).
 *
 * Validation is strict in `prod`: the service refuses to start with missing, short or
 * placeholder secrets, so a half-configured CapRover app fails fast with a clear log line
 * instead of running insecurely (same policy as Tabayyun).
 */
import type { S3Settings } from './storage/s3Storage.js';
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
  /**
   * More origins the app is served from besides SUFFA_PUBLIC_URL (comma-separated), e.g. the
   * old domain while moving to a new one. Sign-in mails always link to SUFFA_PUBLIC_URL.
   */
  SUFFA_TRUSTED_ORIGINS: z.string().trim().optional(),
  /**
   * Origins of the native app's web view (ADR-0019), allowed cross-origin with bearer tokens
   * (never cookies). Default: Capacitor's iOS and Android origins.
   */
  SUFFA_APP_ORIGINS: z.string().trim().default('capacitor://localhost,https://localhost'),
  /** Universal Links: app ids "TEAMID.bundle.id", comma-separated. */
  SUFFA_IOS_APP_IDS: z.string().trim().optional(),
  /** App Links: "package.name:SHA256FINGERPRINT[,…]" (fingerprints of the signing keys). */
  SUFFA_ANDROID_APP_LINKS: z.string().trim().optional(),
  /** Firebase service account (the JSON, base64-encoded) for FCM push to the apps. */
  SUFFA_FCM_SERVICE_ACCOUNT: z.string().trim().optional(),
  /** SMTP for sign-in mails: the Google Workspace relay (smtp-relay.gmail.com). */
  SUFFA_SMTP_HOST: z.string().trim().optional(),
  SUFFA_SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SUFFA_SMTP_USER: z.string().trim().optional(),
  SUFFA_SMTP_PASSWORD: z.string().optional(),
  SUFFA_MAIL_FROM: z.string().trim().optional(),
  SUFFA_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  SUFFA_VERSION: z.string().default('dev'),
  SUFFA_WORKER_HEARTBEAT_MS: z.coerce.number().int().min(1000).default(30_000),
  SUFFA_SYNC_DEV_TOKENS: z.string().optional(),
  /** Browser tests: sign-in links are written to files in this directory (never in prod). */
  SUFFA_MAIL_DIR: z.string().trim().optional(),
  /** GlitchTip/Sentry DSN of the suffa-api project; error reporting is off when unset. */
  SUFFA_ERROR_DSN: optionalDsn('SUFFA_ERROR_DSN'),
  /** DSN of the suffa-web project, handed to the PWA and used by the /api/errors tunnel. */
  SUFFA_WEB_ERROR_DSN: optionalDsn('SUFFA_WEB_ERROR_DSN'),
  /**
   * Web Push (story 6.3): a VAPID key pair (`npx web-push generate-vapid-keys`) and a
   * contact (mailto: or https:). Reminders stay off until all three are set.
   */
  SUFFA_VAPID_PUBLIC_KEY: z.string().trim().optional(),
  SUFFA_VAPID_PRIVATE_KEY: z.string().trim().optional(),
  SUFFA_VAPID_SUBJECT: z.string().trim().optional(),
  /**
   * Object storage (ADR-0017): the S3 endpoint of the shared RustFS (internal, e.g.
   * http://srv-captain--rustfs:9000) and the `suffa-app` key. Recordings stay off without it.
   */
  SUFFA_S3_ENDPOINT: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .pipe(z.string().url('SUFFA_S3_ENDPOINT must be a URL').optional())
    .optional(),
  SUFFA_S3_REGION: z.string().trim().default('us-east-1'),
  SUFFA_S3_ACCESS_KEY_ID: z.string().trim().optional(),
  SUFFA_S3_SECRET_ACCESS_KEY: z.string().optional(),
  SUFFA_S3_BUCKET_MEDIA: z.string().trim().default('suffa-media'),
  SUFFA_S3_BUCKET_UPLOADS: z.string().trim().default('suffa-uploads'),
  SUFFA_S3_BUCKET_CONTENT: z.string().trim().default('suffa-content'),
  /**
   * Google Drive import (story 7.2, ADR-0018): an OAuth web client (redirect URI
   * <public URL>/api/v1/drive/callback), a browser API key for the Picker and the project
   * number as Picker app id. Drive import stays off until all four are set.
   */
  /**
   * Transcription (story 8.1): an OpenAI-compatible /audio/transcriptions endpoint (OpenAI,
   * Groq, or a self-hosted faster-whisper server such as speaches). Off without a URL.
   */
  SUFFA_TRANSCRIBE_URL: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .pipe(z.string().url('SUFFA_TRANSCRIBE_URL must be a URL').optional())
    .optional(),
  SUFFA_TRANSCRIBE_TOKEN: z.string().trim().optional(),
  SUFFA_TRANSCRIBE_MODEL: z.string().trim().default('whisper-1'),
  // AI gateway (ADR-0010): each provider is on only with its key; keys stay on the server.
  SUFFA_ANTHROPIC_API_KEY: z.string().trim().optional(),
  SUFFA_OPENROUTER_API_KEY: z.string().trim().optional(),
  SUFFA_HF_API_KEY: z.string().trim().optional(),
  /** Dedicated Hugging Face Inference Endpoint; the shared router otherwise. */
  SUFFA_HF_ENDPOINT_URL: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .pipe(z.string().url('SUFFA_HF_ENDPOINT_URL must be a URL').optional())
    .optional(),
  /** YouTube Data API v3 key for the video catalog import (server side, ADR-0012). */
  SUFFA_YOUTUBE_API_KEY: z.string().trim().optional(),
  SUFFA_GOOGLE_CLIENT_ID: z.string().trim().optional(),
  SUFFA_GOOGLE_CLIENT_SECRET: z.string().trim().optional(),
  SUFFA_GOOGLE_API_KEY: z.string().trim().optional(),
  SUFFA_GOOGLE_APP_ID: z.string().trim().optional(),
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
  /** Origins browsers may send (SUFFA_PUBLIC_URL first, then SUFFA_TRUSTED_ORIGINS). */
  trustedOrigins: string[];
  /** Native app web view origins (bearer tokens, CORS without credentials). */
  appOrigins: string[];
  /** Universal Links / App Links (served under /.well-known); undefined parts are off. */
  appLinks: {
    iosAppIds: string[];
    android: { packageName: string; fingerprints: string[] } | undefined;
  };
  /** FCM service account; undefined turns app push off (local reminders still work). */
  fcm: { projectId: string; clientEmail: string; privateKey: string } | undefined;
  /** SMTP for sign-in mails; outside prod the link may go to the log instead. */
  smtp: SmtpSettings | undefined;
  /** Browser tests: where sign-in links are written instead of mailed (never in prod). */
  mailDir: string | undefined;
  /** Public DSN of the web project; undefined disables browser error reporting. */
  webErrorDsn: string | undefined;
  /** Object storage; undefined turns recordings and uploads off. */
  storage: S3Settings | undefined;
  /** Transcription service; undefined turns automatic transcripts off. */
  transcribe: { url: string; token: string | null; model: string } | undefined;
  /** AI provider keys (ADR-0010); a provider without a key is simply not routed to. */
  ai: {
    anthropicKey: string | undefined;
    openRouterKey: string | undefined;
    huggingFaceKey: string | undefined;
    huggingFaceEndpoint: string | undefined;
  };
  /** YouTube Data API key; undefined turns the catalog import off. */
  youtubeApiKey: string | undefined;
  /** Google Drive import; undefined turns it off. */
  google:
    | { clientId: string; clientSecret: string; apiKey: string; appId: string }
    | undefined;
  /** Optional features switched off because their settings are incomplete (logged at start). */
  warnings: string[];
  /** Web Push keys; undefined turns push reminders off. */
  vapid: { publicKey: string; privateKey: string; subject: string } | undefined;
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
  // An optional feature set up only in part stays off instead of stopping the service:
  // sign-in and sync must not go down because of, say, a missing storage key.
  const warnings: string[] = [];

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
  if (raw.SUFFA_MAIL_DIR && raw.SUFFA_ENV === 'prod') {
    issues.push('SUFFA_MAIL_DIR must not be set in prod');
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
  const s3Parts = [
    raw.SUFFA_S3_ENDPOINT,
    raw.SUFFA_S3_ACCESS_KEY_ID,
    raw.SUFFA_S3_SECRET_ACCESS_KEY,
  ];
  const s3Complete = s3Parts.every(Boolean);
  if (s3Parts.some(Boolean) && !s3Complete) {
    warnings.push(
      'SUFFA_S3_ENDPOINT, SUFFA_S3_ACCESS_KEY_ID and SUFFA_S3_SECRET_ACCESS_KEY go together'
    );
  }
  const googleParts = [
    raw.SUFFA_GOOGLE_CLIENT_ID,
    raw.SUFFA_GOOGLE_CLIENT_SECRET,
    raw.SUFFA_GOOGLE_API_KEY,
    raw.SUFFA_GOOGLE_APP_ID,
  ];
  const googleComplete = googleParts.every(Boolean);
  if (googleParts.some(Boolean) && !googleComplete) {
    warnings.push(
      'SUFFA_GOOGLE_CLIENT_ID, SUFFA_GOOGLE_CLIENT_SECRET, SUFFA_GOOGLE_API_KEY and SUFFA_GOOGLE_APP_ID go together'
    );
  }
  const vapidParts = [
    raw.SUFFA_VAPID_PUBLIC_KEY,
    raw.SUFFA_VAPID_PRIVATE_KEY,
    raw.SUFFA_VAPID_SUBJECT,
  ];
  let vapidComplete = vapidParts.every(Boolean);
  if (vapidParts.some(Boolean) && !vapidComplete) {
    warnings.push(
      'SUFFA_VAPID_PUBLIC_KEY, SUFFA_VAPID_PRIVATE_KEY and SUFFA_VAPID_SUBJECT go together'
    );
  }
  if (vapidComplete && !/^(mailto:|https:\/\/)/.test(raw.SUFFA_VAPID_SUBJECT!)) {
    warnings.push('SUFFA_VAPID_SUBJECT must start with mailto: or https://');
    vapidComplete = false;
  }
  const extraOrigins = parseOrigins(raw.SUFFA_TRUSTED_ORIGINS);
  issues.push(...extraOrigins.issues);
  const appOrigins = raw.SUFFA_APP_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  for (const origin of appOrigins) {
    if (!/^(capacitor|https|ionic):\/\/[a-z0-9.-]+(:\d+)?$/.test(origin)) {
      issues.push(
        `SUFFA_APP_ORIGINS: "${origin}" is not an app origin like capacitor://localhost`
      );
    }
  }
  const android = parseAndroidAppLinks(raw.SUFFA_ANDROID_APP_LINKS);
  warnings.push(...android.issues);
  const fcm = parseServiceAccount(raw.SUFFA_FCM_SERVICE_ACCOUNT);
  warnings.push(...fcm.issues);
  if (issues.length > 0) throw new ConfigError(issues);
  const trustedOrigins = [
    ...new Set([
      ...(raw.SUFFA_PUBLIC_URL ? [new URL(raw.SUFFA_PUBLIC_URL).origin] : []),
      ...extraOrigins.origins,
    ]),
  ];

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
    trustedOrigins,
    appOrigins,
    appLinks: {
      iosAppIds: (raw.SUFFA_IOS_APP_IDS ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter((id) => /^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/.test(id)),
      android: android.value,
    },
    fcm: fcm.value,
    mailDir: raw.SUFFA_MAIL_DIR || undefined,
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
    storage: s3Complete
      ? {
          endpoint: raw.SUFFA_S3_ENDPOINT!.replace(/\/$/, ''),
          region: raw.SUFFA_S3_REGION,
          accessKeyId: raw.SUFFA_S3_ACCESS_KEY_ID!,
          secretAccessKey: raw.SUFFA_S3_SECRET_ACCESS_KEY!,
          buckets: {
            media: raw.SUFFA_S3_BUCKET_MEDIA,
            uploads: raw.SUFFA_S3_BUCKET_UPLOADS,
            content: raw.SUFFA_S3_BUCKET_CONTENT,
          },
        }
      : undefined,
    transcribe: raw.SUFFA_TRANSCRIBE_URL
      ? {
          url: raw.SUFFA_TRANSCRIBE_URL,
          token: raw.SUFFA_TRANSCRIBE_TOKEN || null,
          model: raw.SUFFA_TRANSCRIBE_MODEL,
        }
      : undefined,
    ai: {
      anthropicKey: raw.SUFFA_ANTHROPIC_API_KEY || undefined,
      openRouterKey: raw.SUFFA_OPENROUTER_API_KEY || undefined,
      huggingFaceKey: raw.SUFFA_HF_API_KEY || undefined,
      huggingFaceEndpoint: raw.SUFFA_HF_ENDPOINT_URL,
    },
    youtubeApiKey: raw.SUFFA_YOUTUBE_API_KEY || undefined,
    google: googleComplete
      ? {
          clientId: raw.SUFFA_GOOGLE_CLIENT_ID!,
          clientSecret: raw.SUFFA_GOOGLE_CLIENT_SECRET!,
          apiKey: raw.SUFFA_GOOGLE_API_KEY!,
          appId: raw.SUFFA_GOOGLE_APP_ID!,
        }
      : undefined,
    warnings,
    vapid: vapidComplete
      ? {
          publicKey: raw.SUFFA_VAPID_PUBLIC_KEY!,
          privateKey: raw.SUFFA_VAPID_PRIVATE_KEY!,
          subject: raw.SUFFA_VAPID_SUBJECT!,
        }
      : undefined,
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

/**
 * "https://a.example,https://b.example" → origins. Only bare http(s) origins are accepted,
 * so a typo (a path, a stray character) is reported instead of silently never matching.
 */
export function parseOrigins(value: string | undefined): {
  origins: string[];
  issues: string[];
} {
  const origins: string[] = [];
  const issues: string[] = [];
  for (const entry of (value ?? '').split(',').map((part) => part.trim())) {
    if (!entry) continue;
    let url: URL | null = null;
    try {
      url = new URL(entry);
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
    const bare = url !== null && entry.replace(/\/$/, '') === url.origin;
    // URL() accepts characters like ")" in host names; real host names never have them.
    const plainHost = url !== null && /^[a-z0-9.-]+$/.test(url.hostname);
    if (!url || !bare || !plainHost || !/^https?:$/.test(url.protocol)) {
      issues.push(
        `SUFFA_TRUSTED_ORIGINS: "${entry}" is not an origin like https://suffa.example.org`
      );
    } else {
      origins.push(url.origin);
    }
  }
  return { origins, issues };
}

/** "org.siralabs.suffa:AB:CD:…[,…]" → package name and SHA-256 fingerprints. */
export function parseAndroidAppLinks(value: string | undefined): {
  value: { packageName: string; fingerprints: string[] } | undefined;
  issues: string[];
} {
  if (!value) return { value: undefined, issues: [] };
  const [packageName, ...rest] = value.split(':');
  const fingerprints = rest
    .join(':')
    .split(',')
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean);
  const valid =
    /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i.test(packageName ?? '') &&
    fingerprints.length > 0 &&
    fingerprints.every((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));
  return valid
    ? { value: { packageName: packageName!, fingerprints }, issues: [] }
    : {
        value: undefined,
        issues: ['SUFFA_ANDROID_APP_LINKS must look like package.name:AA:BB:…(32 bytes)'],
      };
}

/** The Firebase service account JSON (base64) → what FCM needs. */
export function parseServiceAccount(value: string | undefined): {
  value: { projectId: string; clientEmail: string; privateKey: string } | undefined;
  issues: string[];
} {
  if (!value) return { value: undefined, issues: [] };
  try {
    const json = JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    if (
      json.project_id &&
      json.client_email &&
      json.private_key?.includes('PRIVATE KEY')
    ) {
      return {
        value: {
          projectId: json.project_id,
          clientEmail: json.client_email,
          privateKey: json.private_key,
        },
        issues: [],
      };
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  return {
    value: undefined,
    issues: [
      'SUFFA_FCM_SERVICE_ACCOUNT must be the base64 of a Firebase service account JSON',
    ],
  };
}
