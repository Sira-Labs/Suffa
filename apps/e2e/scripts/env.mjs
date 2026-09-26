/**
 * One place for the test environment: ports, the throwaway database and the mail folder.
 * E2E_DATABASE_URL must point at a database the tests may wipe (never a real one).
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const API_PORT = Number(process.env.E2E_API_PORT ?? 8100);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4180);
// localhost, not 127.0.0.1: WebAuthn (passkeys) refuses IP addresses as relying party.
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const API_URL = `http://127.0.0.1:${API_PORT}`;
export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgres://suffa:localtestonly-pw@localhost:5432/suffa_e2e';
export const MAIL_DIR = process.env.E2E_MAIL_DIR ?? join(tmpdir(), 'suffa-e2e-mail');
