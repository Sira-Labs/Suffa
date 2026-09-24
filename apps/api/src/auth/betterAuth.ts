/**
 * Sign-in with Better Auth (ADR-0008), magic link only: the learner enters an email address,
 * gets a link, and the click signs them in with an httpOnly session cookie. Web and API share
 * one origin (Caddy proxies /api), so there are no tokens in the browser's storage.
 *
 * Better Auth's field names are mapped onto our snake_case tables (migration 0003); user ids
 * are UUIDs, so records keep working with the sync tables and the Supabase migration.
 */
import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import type pg from 'pg';
import type { AuthResolver } from './resolver.js';
import type { Mailer } from './mailer.js';

/** Where the auth routes live; Caddy forwards /api to this service. */
export const AUTH_BASE_PATH = '/api/v1/auth';
/** A magic link is valid this long (seconds). */
export const MAGIC_LINK_TTL_SEC = 15 * 60;
/** Sessions last 30 days and are extended once a day while used. */
const SESSION_TTL_SEC = 30 * 24 * 60 * 60;
const SESSION_REFRESH_SEC = 24 * 60 * 60;

export interface AuthOptions {
  pool: pg.Pool;
  /** SUFFA_AUTH_SECRET: signs cookies and tokens. */
  secret: string;
  /** Public URL of the app, e.g. https://suffa.example.org (links in mails point here). */
  publicUrl: string;
  mailer: Mailer;
  /** Secure cookies and rate limits on (prod); tests may switch rate limits on explicitly. */
  production: boolean;
  rateLimit?: boolean;
}

const timestamps = { createdAt: 'created_at', updatedAt: 'updated_at' } as const;

export function createAuth(options: AuthOptions) {
  return betterAuth({
    appName: 'Suffa',
    secret: options.secret,
    baseURL: options.publicUrl,
    basePath: AUTH_BASE_PATH,
    trustedOrigins: [options.publicUrl],
    database: options.pool,
    // Magic link is the only way in (no passwords to forget or leak).
    emailAndPassword: { enabled: false },
    user: {
      modelName: 'users',
      fields: { emailVerified: 'email_verified', ...timestamps },
      additionalFields: {
        // Platform role (ADR-0009); only admins change it, never the sign-up request.
        role: { type: 'string', required: false, defaultValue: 'student', input: false },
      },
    },
    session: {
      modelName: 'sessions',
      fields: {
        userId: 'user_id',
        expiresAt: 'expires_at',
        ipAddress: 'ip_address',
        userAgent: 'user_agent',
        ...timestamps,
      },
      expiresIn: SESSION_TTL_SEC,
      updateAge: SESSION_REFRESH_SEC,
    },
    account: {
      modelName: 'accounts',
      fields: {
        userId: 'user_id',
        accountId: 'account_id',
        providerId: 'provider_id',
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        idToken: 'id_token',
        accessTokenExpiresAt: 'access_token_expires_at',
        refreshTokenExpiresAt: 'refresh_token_expires_at',
        ...timestamps,
      },
    },
    verification: {
      modelName: 'verifications',
      fields: { expiresAt: 'expires_at', ...timestamps },
    },
    rateLimit: {
      enabled: options.rateLimit ?? options.production,
      storage: 'database',
      modelName: 'rate_limits',
      fields: { lastRequest: 'last_request' },
      window: 60,
      max: 60,
      customRules: {
        // Mails cost trust: at most 5 sign-in links per 10 minutes and client.
        '/sign-in/magic-link': { window: 600, max: 5 },
        '/magic-link/verify': { window: 60, max: 10 },
      },
    },
    advanced: {
      cookiePrefix: 'suffa',
      useSecureCookies: options.production,
      database: { generateId: () => randomUUID() },
      // Caddy and CapRover's nginx sit in front; the client address is the first hop.
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
    },
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_TTL_SEC,
        storeToken: 'hashed',
        sendMagicLink: ({ email, url }) => options.mailer.sendMagicLink(email, url),
      }),
    ],
  });
}

export type SuffaAuth = ReturnType<typeof createAuth>;

/** Query and body fields that name where to go after signing in. */
const REDIRECT_FIELDS = [
  'callbackURL',
  'errorCallbackURL',
  'newUserCallbackURL',
] as const;

/** Only paths inside the app are allowed as redirect targets ("/settings", not "//evil"). */
export function isSafeRedirect(value: unknown): boolean {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value);
}

/**
 * Defence in depth against open redirects: every redirect target must be a path inside the
 * app, whether it arrives in the sign-in request or in the link. Returns a 400 response for
 * an unsafe request, or null to let Better Auth handle it.
 */
export async function rejectUnsafeRedirect(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const values: unknown[] = REDIRECT_FIELDS.map((field) => url.searchParams.get(field));
  if (
    request.method === 'POST' &&
    request.headers.get('content-type')?.includes('json')
  ) {
    let body: unknown;
    try {
      body = await request.clone().json();
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return null; // Malformed JSON: Better Auth answers it itself.
    }
    if (body && typeof body === 'object') {
      for (const field of REDIRECT_FIELDS)
        values.push((body as Record<string, unknown>)[field]);
    }
  }
  const unsafe = values.some((v) => v !== null && v !== undefined && !isSafeRedirect(v));
  return unsafe ? Response.json({ error: 'invalid_redirect' }, { status: 400 }) : null;
}

/** The signed-in user, as the app sees it. */
export interface Me {
  id: string;
  email: string;
  name: string | null;
  role: 'student' | 'teacher' | 'admin';
}

/** Session lookup for other routes (sync, /me): the session cookie identifies the user. */
export class SessionResolver implements AuthResolver {
  constructor(private readonly auth: SuffaAuth) {}

  async me(headers: Headers): Promise<Me | null> {
    const session = await this.auth.api.getSession({ headers });
    if (!session) return null;
    const user = session.user as typeof session.user & { role?: string };
    const role = user.role === 'teacher' || user.role === 'admin' ? user.role : 'student';
    return { id: user.id, email: user.email, name: user.name || null, role };
  }

  async resolve(headers: Headers): Promise<string | null> {
    return (await this.me(headers))?.id ?? null;
  }
}

/** Tries each resolver in turn (session first; dev tokens outside prod). */
export class ChainResolver implements AuthResolver {
  constructor(private readonly resolvers: readonly AuthResolver[]) {}

  async resolve(headers: Headers): Promise<string | null> {
    for (const resolver of this.resolvers) {
      const userId = await resolver.resolve(headers);
      if (userId) return userId;
    }
    return null;
  }
}
