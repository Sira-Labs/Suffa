import type { Messages } from '../../types';
import type { account as de } from '../de/account';

export const account: Messages<typeof de> = {
  title: 'Sign in to Suffa',
  signedInAs: '✓ You are signed in as {{who}}.',
  intro:
    'No password: enter your email address and we send you a sign-in link. With the same account you keep learning on phone and computer, and your class sees your progress.',
  skip: 'Continue without an account – your progress stays on this device only',
  email: 'Email address',
  emailPlaceholder: 'you@example.com',
  sendLink: 'Send link',
  sendFailed: 'The sign-in link could not be sent.',
  signInFailed: 'Signing in did not work.',
  sentTo: '✓ Link sent to {{email}}',
  sentHint:
    'Open the email on this device and tap “Sign in to Suffa”. Link and code are valid for 15 minutes. Nothing arrived? Check your spam folder too.',
  codePrompt:
    'Does your mail app open the link in its own browser? Then enter the 6-digit code from the email here:',
  code: 'Sign-in code',
  signIn: 'Sign in',
  sendAgain: 'Send again',
  otherEmail: 'Use another email address',
  passkey: '🔑 Sign in with a passkey',
  linkExpired: 'This sign-in link has expired or was already used. Request a new one.',
  linkFailed: 'Signing in did not work. Request a new link.',
};
