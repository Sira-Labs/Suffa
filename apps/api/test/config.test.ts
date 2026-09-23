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
