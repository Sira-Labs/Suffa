import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLIENT_CONFIG_URL,
  ERROR_TUNNEL_URL,
  initErrorTracking,
  reportError,
  resetErrorTrackingForTests,
} from './errorTracking';
import { logger } from './logger';

/** Minimal stand-in for `@sentry/browser`: records what the app would send. */
function fakeSdk() {
  const scope = { setExtras: vi.fn() };
  const sdk = {
    init: vi.fn(),
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    withScope: vi.fn((fn: (s: typeof scope) => void) => fn(scope)),
  };
  return { sdk, scope, loadSdk: async () => sdk as never };
}

afterEach(() => {
  resetErrorTrackingForTests();
  vi.unstubAllGlobals();
});

describe('initErrorTracking', () => {
  it('stays off and never loads the SDK when the server has no DSN', async () => {
    const { sdk, loadSdk } = fakeSdk();
    const on = await initErrorTracking({
      fetchConfig: async () => ({ errorDsn: null }),
      loadSdk,
    });
    expect(on).toBe(false);
    expect(sdk.init).not.toHaveBeenCalled();
    expect(() => reportError(new Error('ignored'))).not.toThrow();
  });

  it('stays off when offline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );
    expect(await initErrorTracking()).toBe(false);
  });

  it('asks the own server for the DSN, uncached', async () => {
    const fetchMock = vi.fn(async () => Response.json({ errorDsn: null }));
    vi.stubGlobal('fetch', fetchMock);
    await initErrorTracking();
    expect(fetchMock).toHaveBeenCalledWith(
      CLIENT_CONFIG_URL,
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('sends through the tunnel with release and without personal data', async () => {
    const { sdk, loadSdk } = fakeSdk();
    await initErrorTracking({
      fetchConfig: async () => ({ errorDsn: 'https://key@glitchtip.example.com/2' }),
      loadSdk,
      release: 'sha-abc1234',
      environment: 'prod',
    });
    expect(sdk.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://key@glitchtip.example.com/2',
        tunnel: ERROR_TUNNEL_URL,
        release: 'sha-abc1234',
        environment: 'prod',
        dataCollection: expect.objectContaining({
          userInfo: false,
          cookies: false,
          httpHeaders: false,
          urlQueryParams: false,
        }),
      })
    );
    const { integrations } = sdk.init.mock.calls[0]![0] as {
      integrations: (d: { name: string }[]) => { name: string }[];
    };
    expect(
      integrations([{ name: 'BrowserSession' }, { name: 'GlobalHandlers' }]).map(
        (i) => i.name
      )
    ).toEqual(['GlobalHandlers']);
  });

  it('reports errors with context, and non-errors as messages', async () => {
    const { sdk, scope, loadSdk } = fakeSdk();
    await initErrorTracking({
      fetchConfig: async () => ({ errorDsn: 'https://key@glitchtip.example.com/2' }),
      loadSdk,
    });
    const boom = new Error('boom');
    reportError(boom, { source: 'router' });
    reportError('plain text');
    expect(sdk.captureException).toHaveBeenCalledWith(boom);
    expect(scope.setExtras).toHaveBeenCalledWith({ source: 'router' });
    expect(sdk.captureMessage).toHaveBeenCalledWith('plain text', 'error');
  });

  it('forwards logger errors, but not warnings', async () => {
    const { sdk, loadSdk } = fakeSdk();
    await initErrorTracking({
      fetchConfig: async () => ({ errorDsn: 'https://key@glitchtip.example.com/2' }),
      loadSdk,
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const log = logger.child('sync');
    log.warn('langsam');
    log.error('Sync-Fehler', { table: 'srs_cards' });
    expect(sdk.captureMessage).toHaveBeenCalledTimes(1);
    expect(sdk.captureMessage).toHaveBeenCalledWith('app:sync: Sync-Fehler', 'error');
  });
});
