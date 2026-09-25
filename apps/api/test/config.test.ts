import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, redactDatabaseUrl } from '../src/config.js';

const GOOD_DB = 'postgres://suffa:0123456789abcdef0123@srv-captain--suffa-db:5432/suffa';
const GOOD_SECRET = 'a'.repeat(48);

describe('loadConfig', () => {
  it('applies defaults in dev', () => {
    const config = loadConfig({ SUFFA_DATABASE_URL: 'postgres://u:p@localhost/db' });
    expect(config).toMatchObject({ env: 'dev', role: 'api', port: 8000, dbPoolMax: 10 });
  });

  it('accepts a complete prod configuration', () => {
    const config = loadConfig({
      SUFFA_ENV: 'prod',
      SUFFA_ROLE: 'worker',
      SUFFA_DATABASE_URL: GOOD_DB,
      SUFFA_AUTH_SECRET: GOOD_SECRET,
    });
    expect(config.role).toBe('worker');
  });

  it('requires the public URL for the prod api and reads SMTP settings', () => {
    const prodApi = {
      SUFFA_ENV: 'prod',
      SUFFA_DATABASE_URL: GOOD_DB,
      SUFFA_AUTH_SECRET: GOOD_SECRET,
    };
    expect(() => loadConfig(prodApi)).toThrow(/SUFFA_PUBLIC_URL is required/);
    // Without SMTP the api still starts; sign-in stays off (main.ts logs it).
    expect(
      loadConfig({ ...prodApi, SUFFA_PUBLIC_URL: 'https://suffa.example.org' }).smtp
    ).toBeUndefined();
    const config = loadConfig({
      ...prodApi,
      SUFFA_PUBLIC_URL: 'https://suffa.example.org/',
      SUFFA_SMTP_HOST: 'smtp-relay.gmail.com',
      SUFFA_SMTP_USER: 'noreply@example.org',
      SUFFA_SMTP_PASSWORD: 'app-password-from-env',
      SUFFA_MAIL_FROM: 'Suffa <noreply@example.org>',
    });
    expect(config.publicUrl).toBe('https://suffa.example.org');
    expect(config.smtp).toMatchObject({
      host: 'smtp-relay.gmail.com',
      port: 587,
      auth: { user: 'noreply@example.org' },
      clientName: 'suffa.example.org',
    });
  });

  it('refuses half an SMTP configuration', () => {
    expect(() =>
      loadConfig({ SUFFA_DATABASE_URL: GOOD_DB, SUFFA_SMTP_HOST: 'smtp-relay.gmail.com' })
    ).toThrow(/SUFFA_SMTP_HOST and SUFFA_MAIL_FROM go together/);
    expect(() =>
      loadConfig({
        SUFFA_DATABASE_URL: GOOD_DB,
        SUFFA_SMTP_HOST: 'smtp-relay.gmail.com',
        SUFFA_MAIL_FROM: 'Suffa <noreply@example.org>',
        SUFFA_SMTP_USER: 'noreply@example.org',
      })
    ).toThrow(/SUFFA_SMTP_USER and SUFFA_SMTP_PASSWORD go together/);
    expect(loadConfig({ SUFFA_DATABASE_URL: GOOD_DB }).smtp).toBeUndefined();
  });

  it('accepts the Workspace relay without credentials (allowed by server IP)', () => {
    const config = loadConfig({
      SUFFA_DATABASE_URL: GOOD_DB,
      SUFFA_SMTP_HOST: 'smtp-relay.gmail.com',
      SUFFA_SMTP_PORT: '587',
      SUFFA_MAIL_FROM: 'Suffa <noreply@example.org>',
    });
    expect(config.smtp).toMatchObject({ port: 587, auth: undefined });
  });

  it('accepts an optional error-tracking DSN and treats blank as unset', () => {
    const dsn = 'https://0123abcd@glitchtip.apps.example.com/1';
    expect(
      loadConfig({ SUFFA_DATABASE_URL: GOOD_DB, SUFFA_ERROR_DSN: dsn }).errorDsn
    ).toBe(dsn);
    expect(
      loadConfig({ SUFFA_DATABASE_URL: GOOD_DB, SUFFA_ERROR_DSN: '  ' }).errorDsn
    ).toBeUndefined();
    expect(loadConfig({ SUFFA_DATABASE_URL: GOOD_DB }).errorDsn).toBeUndefined();
  });

  it.each([
    'glitchtip.example.com',
    'https://glitchtip.example.com/1',
    'https://k@h/abc',
  ])('rejects a malformed error-tracking DSN (%s)', (dsn) => {
    expect(() =>
      loadConfig({ SUFFA_DATABASE_URL: GOOD_DB, SUFFA_ERROR_DSN: dsn })
    ).toThrow(/SUFFA_ERROR_DSN/);
  });

  it('requires a database url', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
  });

  it('rejects non-postgres urls', () => {
    expect(() => loadConfig({ SUFFA_DATABASE_URL: 'mysql://x' })).toThrow(/postgres/);
  });

  it.each([
    ['missing secret', { SUFFA_DATABASE_URL: GOOD_DB }],
    ['short secret', { SUFFA_DATABASE_URL: GOOD_DB, SUFFA_AUTH_SECRET: 'short' }],
    [
      'placeholder secret',
      { SUFFA_DATABASE_URL: GOOD_DB, SUFFA_AUTH_SECRET: 'change-me' },
    ],
    [
      'placeholder db password',
      {
        SUFFA_DATABASE_URL: 'postgres://suffa:change-me@db:5432/suffa',
        SUFFA_AUTH_SECRET: GOOD_SECRET,
      },
    ],
  ])('refuses to start in prod with %s', (_label, env) => {
    expect(() => loadConfig({ SUFFA_ENV: 'prod', ...env })).toThrow(ConfigError);
  });

  it('masks the password in logs', () => {
    expect(redactDatabaseUrl(GOOD_DB)).not.toContain('0123456789abcdef');
    expect(redactDatabaseUrl(GOOD_DB)).toContain('***');
  });
});

describe('Web Push keys', () => {
  const base = { SUFFA_DATABASE_URL: 'postgres://u:p@localhost/db' };
  const keys = {
    SUFFA_VAPID_PUBLIC_KEY: 'BPublic',
    SUFFA_VAPID_PRIVATE_KEY: 'private-from-env',
    SUFFA_VAPID_SUBJECT: 'mailto:ops@example.org',
  };

  it('is off without keys and on with all three', () => {
    expect(loadConfig(base).vapid).toBeUndefined();
    expect(loadConfig({ ...base, ...keys }).vapid).toEqual({
      publicKey: 'BPublic',
      privateKey: 'private-from-env',
      subject: 'mailto:ops@example.org',
    });
  });

  it('rejects half a configuration and a subject that is no contact', () => {
    expect(() => loadConfig({ ...base, SUFFA_VAPID_PUBLIC_KEY: 'BPublic' })).toThrow(
      /go together/
    );
    expect(() =>
      loadConfig({ ...base, ...keys, SUFFA_VAPID_SUBJECT: 'ops@example.org' })
    ).toThrow(/mailto:/);
  });
});

describe('SUFFA_TRUSTED_ORIGINS', () => {
  const base = {
    SUFFA_DATABASE_URL: 'postgres://u:p@localhost/db',
    SUFFA_PUBLIC_URL: 'https://suffa.siralabs.org/',
  };

  it('trusts the public URL first, then the extra origins', () => {
    expect(loadConfig(base).trustedOrigins).toEqual(['https://suffa.siralabs.org']);
    expect(
      loadConfig({
        ...base,
        SUFFA_TRUSTED_ORIGINS:
          'https://suffa.siralabs.org, https://suffa-web.apps.example.ch/',
      }).trustedOrigins
    ).toEqual(['https://suffa.siralabs.org', 'https://suffa-web.apps.example.ch']);
  });

  it('reports entries that are not bare origins', () => {
    for (const bad of [
      'https://a.example.ch)',
      'https://a.example/app',
      'suffa.example',
    ]) {
      expect(() => loadConfig({ ...base, SUFFA_TRUSTED_ORIGINS: bad })).toThrow(
        /is not an origin/
      );
    }
  });
});

describe('SUFFA_SYNC_DEV_TOKENS', () => {
  const UUID = '11111111-1111-4111-8111-111111111111';

  it('maps tokens to user ids outside prod', () => {
    const config = loadConfig({
      SUFFA_DATABASE_URL: 'postgres://u:p@localhost/db',
      SUFFA_SYNC_DEV_TOKENS: `${'t'.repeat(40)}=${UUID}`,
    });
    expect(config.syncDevTokens.get('t'.repeat(40))).toBe(UUID);
  });

  it('refuses dev tokens in prod', () => {
    expect(() =>
      loadConfig({
        SUFFA_ENV: 'prod',
        SUFFA_DATABASE_URL: GOOD_DB,
        SUFFA_AUTH_SECRET: GOOD_SECRET,
        SUFFA_SYNC_DEV_TOKENS: `${'t'.repeat(40)}=${UUID}`,
      })
    ).toThrow(/must not be set in prod/);
  });

  it.each([
    ['short token', `short=${UUID}`],
    ['missing uuid', `${'t'.repeat(40)}=`],
    ['bad uuid', `${'t'.repeat(40)}=not-a-uuid`],
  ])('rejects %s', (_label, spec) => {
    expect(() =>
      loadConfig({
        SUFFA_DATABASE_URL: 'postgres://u:p@localhost/db',
        SUFFA_SYNC_DEV_TOKENS: spec,
      })
    ).toThrow(ConfigError);
  });
});
