/**
 * Passkeys (ADR-0008 update 2026-09-26): an optional way in next to the emailed link and
 * code. A signed-in learner adds one in the settings; later one tap with Face ID, Touch ID or
 * the device PIN signs them in. The server keeps the session in its httpOnly cookie, as with
 * the link; nothing is stored in the browser.
 *
 * The WebAuthn ceremonies come from @simplewebauthn/browser, loaded only when a learner
 * actually uses a passkey.
 */
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import { logger } from '@/services/logger';

const log = logger.child('passkeys');

/** A passkey as the settings list it. */
export interface Passkey {
  id: string;
  name: string | null;
  /** "iCloud Keychain", "Google Password Manager", … when the authenticator is known. */
  provider: string | null;
  /** Synced across the learner's devices. */
  synced: boolean;
  createdAt: string;
}

/** Why a passkey ceremony did not work; `cancelled` is the learner closing the prompt. */
export type PasskeyFailure =
  | 'cancelled'
  | 'already-added'
  | 'stale-session'
  | 'unknown-passkey'
  | 'not-verified'
  | 'rate-limited'
  | 'offline'
  | 'failed';

export type PasskeyResult =
  | { ok: true }
  | { ok: false; reason: PasskeyFailure; message?: string };

/** What the learner reads for each failure; `cancelled` stays silent. */
export const PASSKEY_MESSAGES: Record<PasskeyFailure, string | undefined> = {
  cancelled: undefined,
  'already-added': 'Auf diesem Gerät ist schon ein Passkey für Suffa eingerichtet.',
  'stale-session':
    'Zur Sicherheit: Melde dich kurz neu an (Link oder Code), dann kannst du einen Passkey hinzufügen.',
  'unknown-passkey':
    'Dieser Passkey ist bei Suffa nicht (mehr) hinterlegt. Melde dich mit Link oder Code an.',
  'not-verified':
    'Bitte bestätige mit Gesicht, Fingerabdruck oder der PIN deines Geräts.',
  'rate-limited': 'Zu viele Versuche – bitte in ein paar Minuten noch einmal.',
  offline: 'Keine Verbindung – versuch es gleich noch einmal.',
  failed: 'Das hat nicht geklappt. Versuch es noch einmal oder nimm Link oder Code.',
};

export interface WebAuthnCeremonies {
  startRegistration(options: {
    optionsJSON: PublicKeyCredentialCreationOptionsJSON;
  }): Promise<RegistrationResponseJSON>;
  startAuthentication(options: {
    optionsJSON: PublicKeyCredentialRequestOptionsJSON;
  }): Promise<AuthenticationResponseJSON>;
}

const loadCeremonies = (): Promise<WebAuthnCeremonies> =>
  import('@simplewebauthn/browser');

/** Can this browser use passkeys at all? */
export function passkeysSupported(
  scope: { PublicKeyCredential?: unknown } = globalThis as {
    PublicKeyCredential?: unknown;
  }
): boolean {
  return typeof scope.PublicKeyCredential === 'function';
}

/** Maps an error thrown by the browser's WebAuthn prompt. */
export function browserFailure(error: unknown): PasskeyFailure {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'AbortError') return 'cancelled';
  if (name === 'InvalidStateError') return 'already-added';
  return 'failed';
}

/** Maps a refused ceremony answer from the server. */
export async function serverFailure(response: Response): Promise<PasskeyFailure> {
  if (response.status === 429) return 'rate-limited';
  const { code } = ((await response.json().catch(() => null)) ?? {}) as { code?: string };
  if (code === 'SESSION_NOT_FRESH') return 'stale-session';
  if (code === 'PASSKEY_NOT_FOUND') return 'unknown-passkey';
  if (code === 'USER_NOT_VERIFIED') return 'not-verified';
  return 'failed';
}

const failure = (reason: PasskeyFailure): PasskeyResult => ({
  ok: false,
  reason,
  message: PASSKEY_MESSAGES[reason],
});

type Fetch = typeof fetch;

export class PasskeyClient {
  constructor(
    private readonly baseUrl = '',
    private readonly fetchImpl: Fetch = (...args) => fetch(...args),
    private readonly ceremonies: () => Promise<WebAuthnCeremonies> = loadCeremonies
  ) {}

  /** Adds a passkey to the signed-in account. */
  async add(): Promise<PasskeyResult> {
    return this.ceremony(
      '/api/v1/auth/passkey/generate-register-options',
      async (options) => {
        const { startRegistration } = await this.ceremonies();
        const response = await startRegistration({
          optionsJSON: options as PublicKeyCredentialCreationOptionsJSON,
        });
        return { url: '/api/v1/auth/passkey/verify-registration', body: { response } };
      }
    );
  }

  /** Signs in with a passkey; the server sets the session cookie. */
  async signIn(): Promise<PasskeyResult> {
    return this.ceremony(
      '/api/v1/auth/passkey/generate-authenticate-options',
      async (options) => {
        const { startAuthentication } = await this.ceremonies();
        const response = await startAuthentication({
          optionsJSON: options as PublicKeyCredentialRequestOptionsJSON,
        });
        return { url: '/api/v1/auth/passkey/verify-authentication', body: { response } };
      }
    );
  }

  private async ceremony(
    optionsUrl: string,
    run: (options: unknown) => Promise<{ url: string; body: unknown }>
  ): Promise<PasskeyResult> {
    let options: Response;
    try {
      options = await this.request(optionsUrl);
    } catch {
      return failure('offline');
    }
    if (!options.ok) return failure(await serverFailure(options));

    let answer: { url: string; body: unknown };
    try {
      answer = await run(await options.json());
    } catch (error) {
      const reason = browserFailure(error);
      if (reason === 'failed') {
        log.warn('passkey prompt failed', {
          name: error instanceof Error ? error.name : '',
        });
      }
      return failure(reason);
    }

    let verified: Response;
    try {
      verified = await this.request(answer.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(answer.body),
      });
    } catch {
      return failure('offline');
    }
    if (verified.ok) return { ok: true };
    const reason = await serverFailure(verified);
    log.warn('passkey ceremony refused', { status: verified.status, reason });
    return failure(reason);
  }

  private request(path: string, init: RequestInit = {}): Promise<Response> {
    return this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      credentials: 'same-origin',
    });
  }
}
