import { describe, expect, it } from 'vitest';
import { describePasskey } from './AccountPasskeys';

const base = { id: 'p', createdAt: '2026-09-26T08:00:00.000Z' };

describe('describePasskey', () => {
  it('names the provider and says when it is synced', () => {
    expect(
      describePasskey({ ...base, name: null, provider: 'iCloud Keychain', synced: true })
    ).toBe('iCloud Keychain · auf deinen Geräten synchronisiert');
  });

  it('prefers a given name and falls back to "Passkey"', () => {
    expect(
      describePasskey({ ...base, name: 'Laptop', provider: 'X', synced: false })
    ).toBe('Laptop');
    expect(describePasskey({ ...base, name: null, provider: null, synced: false })).toBe(
      'Passkey'
    );
  });
});
