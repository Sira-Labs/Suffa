import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loginRedirect,
  needsSignIn,
  safeNext,
  setSignInSkipped,
  signInReturnPath,
  signInSkipped,
  type GateInput,
} from './signInGate';

const signedOut: GateInput = {
  pathname: '/vocab',
  configured: true,
  checked: true,
  serverDown: false,
  signedIn: false,
  skipped: false,
};

describe('needsSignIn', () => {
  it('sends a signed-out learner to the sign-in page first', () => {
    expect(needsSignIn(signedOut)).toBe(true);
    expect(needsSignIn({ ...signedOut, pathname: '/' })).toBe(true);
  });

  it('lets signed-in learners and those who chose "ohne Konto" through', () => {
    expect(needsSignIn({ ...signedOut, signedIn: true })).toBe(false);
    expect(needsSignIn({ ...signedOut, skipped: true })).toBe(false);
  });

  it('never blocks while the server has not answered, is down or has no sign-in', () => {
    expect(needsSignIn({ ...signedOut, checked: false })).toBe(false);
    expect(needsSignIn({ ...signedOut, serverDown: true })).toBe(false);
    expect(needsSignIn({ ...signedOut, configured: false })).toBe(false);
  });

  it('keeps the sign-in page and invitations open', () => {
    expect(needsSignIn({ ...signedOut, pathname: '/login' })).toBe(false);
    expect(needsSignIn({ ...signedOut, pathname: '/join/abc' })).toBe(false);
    expect(needsSignIn({ ...signedOut, pathname: '/loginx' })).toBe(true);
  });
});

describe('loginRedirect', () => {
  it('remembers the wanted page and carries a failed link along', () => {
    expect(loginRedirect('/', '')).toBe('/login');
    expect(loginRedirect('/classes/1', '?tab=a')).toBe(
      '/login?next=%2Fclasses%2F1%3Ftab%3Da'
    );
    expect(loginRedirect('/settings', '?error=EXPIRED_TOKEN')).toBe(
      '/login?next=%2Fsettings&error=EXPIRED_TOKEN'
    );
  });
});

describe('safeNext', () => {
  it('accepts in-app paths only', () => {
    expect(safeNext('/vocab')).toBe('/vocab');
    expect(safeNext('/classes/1?tab=a')).toBe('/classes/1?tab=a');
    expect(safeNext(null)).toBe('/');
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('/\\evil.example')).toBe('/');
    expect(safeNext('/login?next=/x')).toBe('/');
  });
});

describe('signInReturnPath', () => {
  it('marks the return as just signed in', () => {
    expect(signInReturnPath('/')).toBe('/?angemeldet=1');
    expect(signInReturnPath('/classes/1?tab=a')).toBe('/classes/1?tab=a&angemeldet=1');
  });
});

describe('"ohne Konto weiter"', () => {
  afterEach(() => setSignInSkipped(false));

  it('is remembered on this device until cleared', () => {
    expect(signInSkipped()).toBe(false);
    setSignInSkipped(true);
    expect(signInSkipped()).toBe(true);
    setSignInSkipped(false);
    expect(signInSkipped()).toBe(false);
  });

  it('holds for this session when browser storage is blocked', () => {
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    setSignInSkipped(true);
    expect(localStorage.getItem('suffa.signIn.skipped')).toBeNull();
    expect(signInSkipped()).toBe(true);
    blocked.mockRestore();
  });
});
