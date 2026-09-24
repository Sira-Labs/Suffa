import { describe, expect, it } from 'vitest';
import {
  LOCK_MS,
  MAX_FAILED_CODES,
  SecondFactorService,
  type SecondFactorRepository,
  type TotpRow,
} from '../src/account/secondFactor.js';
import { SecretBox } from '../src/security/secretBox.js';
import { base32Decode, stepAt, totpAt } from '../src/security/totp.js';

const USER = 'u-1';
const box = new SecretBox('k'.repeat(40), 'totp');

function memoryRepo() {
  let row: TotpRow | null = null;
  const sessions = new Set<string>();
  const repo: SecondFactorRepository = {
    get: async () => (row ? { ...row } : null),
    savePending: async (_u, secretEnc) => {
      if (row?.enabledAt) return false;
      row = {
        secretEnc,
        enabledAt: null,
        lastStep: null,
        failedCount: 0,
        lockedUntil: null,
      };
      return true;
    },
    confirm: async (_u, sessionId, step) => {
      if (!row || (row.lastStep !== null && step <= row.lastStep)) {
        return { accepted: false, newlyEnabled: false };
      }
      const newlyEnabled = row.enabledAt === null;
      row = {
        ...row,
        lastStep: step,
        failedCount: 0,
        lockedUntil: null,
        enabledAt: row.enabledAt ?? new Date(),
      };
      sessions.add(sessionId);
      return { accepted: true, newlyEnabled };
    },
    recordFailure: async (_u, failedCount, lockedUntil) => {
      row = { ...row!, failedCount, lockedUntil };
    },
  };
  return { repo, sessions };
}

function setup() {
  let now = Date.parse('2026-09-24T12:00:00.000Z');
  const { repo, sessions } = memoryRepo();
  const service = new SecondFactorService(repo, box, () => now);
  return {
    service,
    sessions,
    advance: (ms: number) => {
      now += ms;
    },
    codeFor: (secret: string, offset = 0) =>
      totpAt(base32Decode(secret), stepAt(now) + offset),
  };
}

describe('SecondFactorService', () => {
  it('enables with the first good code and confirms the session', async () => {
    const { service, sessions, codeFor } = setup();
    const { secret } = (await service.setup(USER, 'chef@example.org'))!;
    expect((await service.status(USER)).enabled).toBe(false);
    expect(await service.confirm(USER, 's-1', codeFor(secret))).toEqual({
      ok: true,
      newlyEnabled: true,
    });
    expect((await service.status(USER)).enabled).toBe(true);
    expect(sessions.has('s-1')).toBe(true);
    // Once enabled, setup cannot replace the secret.
    expect(await service.setup(USER, 'chef@example.org')).toBeNull();
  });

  it('refuses a code that was already used', async () => {
    const { service, codeFor, advance } = setup();
    const { secret } = (await service.setup(USER, 'x'))!;
    const code = codeFor(secret);
    await service.confirm(USER, 's-1', code);
    advance(5_000);
    expect(await service.confirm(USER, 's-2', code)).toEqual({
      ok: false,
      reason: 'invalid_code',
    });
    advance(30_000);
    expect((await service.confirm(USER, 's-2', codeFor(secret))).ok).toBe(true);
  });

  it(`locks for a while after ${MAX_FAILED_CODES} wrong codes`, async () => {
    const { service, codeFor, advance } = setup();
    const { secret } = (await service.setup(USER, 'x'))!;
    for (let i = 1; i < MAX_FAILED_CODES; i++) {
      expect(await service.confirm(USER, 's', '000000')).toEqual({
        ok: false,
        reason: 'invalid_code',
      });
    }
    expect(await service.confirm(USER, 's', '000000')).toEqual({
      ok: false,
      reason: 'locked',
    });
    // Even the right code waits for the lock to end.
    expect(await service.confirm(USER, 's', codeFor(secret))).toEqual({
      ok: false,
      reason: 'locked',
    });
    advance(LOCK_MS + 1);
    expect((await service.confirm(USER, 's', codeFor(secret))).ok).toBe(true);
  });

  it('needs a setup first', async () => {
    const { service } = setup();
    expect(await service.confirm(USER, 's', '123456')).toEqual({
      ok: false,
      reason: 'not_set_up',
    });
  });
});
