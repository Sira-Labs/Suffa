import { describe, expect, it } from 'vitest';
import { isSafeRedirect, rejectUnsafeRedirect } from '../src/auth/betterAuth.js';
import { magicLinkMail } from '../src/auth/mailer.js';

describe('redirect guard', () => {
  it('allows only paths inside the app', () => {
    expect(isSafeRedirect('/settings')).toBe(true);
    expect(isSafeRedirect('/units/1?x=1')).toBe(true);
    expect(isSafeRedirect('//evil.example')).toBe(false);
    expect(isSafeRedirect('/\\evil.example')).toBe(false);
    expect(isSafeRedirect('https://evil.example')).toBe(false);
    expect(isSafeRedirect('javascript:alert(1)')).toBe(false);
  });

  it('checks query and JSON body', async () => {
    const ok = new Request(
      'http://x/api/v1/auth/magic-link/verify?token=t&callbackURL=%2F'
    );
    expect(await rejectUnsafeRedirect(ok)).toBeNull();
    const bad = new Request('http://x/api/v1/auth/sign-in/magic-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.c', callbackURL: 'https://evil.example' }),
    });
    expect((await rejectUnsafeRedirect(bad))?.status).toBe(400);
  });
});

describe('sign-in mail', () => {
  it('contains the link and escapes it in HTML', () => {
    const mail = magicLinkMail(
      'https://suffa.example.org/api/v1/auth/magic-link/verify?token=a&b="c"'
    );
    expect(mail.subject).toBe('Dein Anmeldelink für Suffa');
    expect(mail.text).toContain('token=a&b="c"');
    expect(mail.html).toContain('token=a&amp;b=&quot;c&quot;');
    expect(mail.text).toContain('15 Minuten');
  });
});
