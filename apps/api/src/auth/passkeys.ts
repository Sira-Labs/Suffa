/**
 * Passkeys (ADR-0008 update 2026-09-26): an optional way in next to the emailed link and code.
 * A signed-in learner adds one in the settings; later, one tap with Face ID, Touch ID or the
 * device PIN signs them in. Same approach as Arqam (spec 009).
 *
 * - The relying party is the host of SUFFA_PUBLIC_URL, never taken from the request, so a forged
 *   Origin header cannot widen what a passkey is valid for.
 * - Discoverable credentials: signing in starts without typing an email.
 * - User verification is required: a passkey replaces the mailbox, so a stolen security key
 *   without its PIN must not be enough.
 */
import { getAuthenticatorName, passkey } from '@better-auth/passkey';
import { APIError } from 'better-auth/api';

/** Error code of a ceremony whose authenticator did not verify the user. */
export const USER_NOT_VERIFIED = 'USER_NOT_VERIFIED';

export const AUTHENTICATE_OPTIONS = '/passkey/generate-authenticate-options';

export function relyingParty(publicUrl: string): { rpID: string; origin: string } {
  const url = new URL(publicUrl);
  return { rpID: url.hostname, origin: url.origin };
}

/** Refuses a ceremony in which the authenticator did not verify the user (PIN or biometric). */
export function requireUserVerified(
  status: 'BAD_REQUEST' | 'UNAUTHORIZED',
  userVerified: boolean | undefined
): void {
  if (userVerified !== true) {
    throw APIError.from(status, {
      code: USER_NOT_VERIFIED,
      message: 'The passkey did not verify you with a PIN or biometric.',
    });
  }
}

/** Better Auth's passkey plugin, configured for Suffa and mapped onto the `passkeys` table. */
export function passkeyPlugin(publicUrl: string) {
  const { rpID, origin } = relyingParty(publicUrl);
  return passkey({
    rpID,
    rpName: 'Suffa',
    origin,
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    registration: {
      afterVerification: ({ verification }) => {
        requireUserVerified('BAD_REQUEST', verification.registrationInfo?.userVerified);
      },
    },
    authentication: {
      afterVerification: ({ verification }) => {
        requireUserVerified('UNAUTHORIZED', verification.authenticationInfo.userVerified);
      },
    },
    schema: {
      passkey: {
        modelName: 'passkeys',
        fields: {
          userId: 'user_id',
          publicKey: 'public_key',
          credentialID: 'credential_id',
          deviceType: 'device_type',
          backedUp: 'backed_up',
          createdAt: 'created_at',
        },
      },
    },
  });
}

/** The best-known provider of an authenticator ("iCloud Keychain"), or null. */
export function providerName(aaguid: string | null): string | null {
  return getAuthenticatorName(aaguid ?? undefined) ?? null;
}

/**
 * The plugin asks for `userVerification: 'preferred'` in sign-in options. Asking for 'required'
 * makes browsers prompt for a security key's PIN instead of skipping it and then failing at
 * {@link requireUserVerified}.
 */
export async function requireVerificationInOptions(
  response: Response
): Promise<Response> {
  if (response.status !== 200) return response;
  const options = (await response.json()) as Record<string, unknown>;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(JSON.stringify({ ...options, userVerification: 'required' }), {
    status: response.status,
    headers,
  });
}
