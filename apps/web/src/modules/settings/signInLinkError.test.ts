import { describe, expect, it } from 'vitest';
import { signInLinkError } from './Settings';

describe('signInLinkError', () => {
  it('stays silent without an error', () => {
    expect(signInLinkError(null)).toBeNull();
  });

  it('explains an expired or reused link', () => {
    expect(signInLinkError('EXPIRED_TOKEN')).toMatch(
      /abgelaufen oder wurde schon benutzt/
    );
    expect(signInLinkError('INVALID_TOKEN')).toMatch(
      /abgelaufen oder wurde schon benutzt/
    );
  });

  it('falls back to a general message for other codes', () => {
    expect(signInLinkError('SOMETHING_ELSE')).toMatch(/nicht geklappt/);
  });
});
