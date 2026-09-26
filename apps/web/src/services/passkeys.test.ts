import { describe, expect, it, vi } from 'vitest';
import {
  browserFailure,
  PasskeyClient,
  passkeysSupported,
  serverFailure,
  type WebAuthnCeremonies,
} from './passkeys';

const json = (body: unknown, status = 200) => Response.json(body, { status });
const domError = (name: string) => Object.assign(new Error(name), { name });

function setup(
  answers: Record<string, Response>,
  ceremonies: Partial<WebAuthnCeremonies> = {}
) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    calls.push({ path, init });
    return answers[path]?.clone() ?? json({ code: 'NOT_FOUND' }, 404);
  }) as unknown as typeof fetch;
  const all: WebAuthnCeremonies = {
    startRegistration: vi.fn(async () => ({ id: 'reg' }) as never),
    startAuthentication: vi.fn(async () => ({ id: 'auth' }) as never),
    ...ceremonies,
  };
  return { client: new PasskeyClient('', fetchImpl, async () => all), calls, all };
}

const REGISTER_OPTIONS = '/api/v1/auth/passkey/generate-register-options';
const VERIFY_REGISTRATION = '/api/v1/auth/passkey/verify-registration';
const SIGN_IN_OPTIONS = '/api/v1/auth/passkey/generate-authenticate-options';
const VERIFY_SIGN_IN = '/api/v1/auth/passkey/verify-authentication';

describe('passkeys', () => {
  it('adds a passkey: options, browser prompt, verification with the cookie', async () => {
    const { client, calls, all } = setup({
      [REGISTER_OPTIONS]: json({ challenge: 'c1' }),
      [VERIFY_REGISTRATION]: json({ ok: true }),
    });
    expect(await client.add()).toEqual({ ok: true });
    expect(all.startRegistration).toHaveBeenCalledWith({
      optionsJSON: { challenge: 'c1' },
    });
    expect(calls.map((c) => c.path)).toEqual([REGISTER_OPTIONS, VERIFY_REGISTRATION]);
    expect(calls[1]!.init).toMatchObject({ method: 'POST', credentials: 'same-origin' });
    expect(JSON.parse(String(calls[1]!.init!.body))).toEqual({ response: { id: 'reg' } });
  });

  it('signs in with a passkey', async () => {
    const { client, calls, all } = setup({
      [SIGN_IN_OPTIONS]: json({ challenge: 'c2' }),
      [VERIFY_SIGN_IN]: json({ ok: true }),
    });
    expect(await client.signIn()).toEqual({ ok: true });
    expect(all.startAuthentication).toHaveBeenCalledWith({
      optionsJSON: { challenge: 'c2' },
    });
    expect(calls.map((c) => c.path)).toEqual([SIGN_IN_OPTIONS, VERIFY_SIGN_IN]);
  });

  it('stays silent when the learner closes the prompt', async () => {
    const { client, calls } = setup(
      { [SIGN_IN_OPTIONS]: json({ challenge: 'c' }) },
      { startAuthentication: async () => Promise.reject(domError('NotAllowedError')) }
    );
    expect(await client.signIn()).toEqual({
      ok: false,
      reason: 'cancelled',
      message: undefined,
    });
    expect(calls).toHaveLength(1);
  });

  it('asks for a fresh sign-in before adding one to an old session', async () => {
    const { client } = setup({
      [REGISTER_OPTIONS]: json({ code: 'SESSION_NOT_FRESH' }, 403),
    });
    const result = await client.add();
    expect(result).toMatchObject({ ok: false, reason: 'stale-session' });
    expect(!result.ok && result.message).toMatch(/neu an/);
  });

  it('explains an unknown or unverified passkey and rate limits', async () => {
    expect(await serverFailure(json({ code: 'PASSKEY_NOT_FOUND' }, 401))).toBe(
      'unknown-passkey'
    );
    expect(await serverFailure(json({ code: 'USER_NOT_VERIFIED' }, 401))).toBe(
      'not-verified'
    );
    expect(await serverFailure(new Response('slow down', { status: 429 }))).toBe(
      'rate-limited'
    );
    expect(await serverFailure(new Response('<html>', { status: 500 }))).toBe('failed');
  });

  it('maps browser errors', () => {
    expect(browserFailure(domError('NotAllowedError'))).toBe('cancelled');
    expect(browserFailure(domError('AbortError'))).toBe('cancelled');
    expect(browserFailure(domError('InvalidStateError'))).toBe('already-added');
    expect(browserFailure(new TypeError('x'))).toBe('failed');
    expect(browserFailure('weird')).toBe('failed');
  });

  it('reports offline when the network is gone', async () => {
    const client = new PasskeyClient('', (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch);
    expect(await client.signIn()).toMatchObject({ ok: false, reason: 'offline' });
  });

  it('knows whether the browser has WebAuthn', () => {
    expect(passkeysSupported({ PublicKeyCredential: function () {} })).toBe(true);
    expect(passkeysSupported({})).toBe(false);
  });
});
