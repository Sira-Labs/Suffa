/**
 * Starts the real API for the browser tests on a wiped database. Sign-in links go to files
 * in MAIL_DIR (FileMailer), which the tests read. Refuses anything that looks like a real
 * database: the name must end in "_e2e".
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { API_PORT, DATABASE_URL, MAIL_DIR, WEB_URL } from './env.mjs';

const dbName = new URL(DATABASE_URL).pathname.slice(1);
if (!dbName.endsWith('_e2e')) {
  console.error(
    `E2E_DATABASE_URL must name a throwaway database ending in _e2e, got "${dbName}"`
  );
  process.exit(2);
}

const admin = new pg.Client({
  connectionString: DATABASE_URL.replace(/\/[^/]+$/, '/postgres'),
});
await admin.connect();
const exists = await admin.query('select 1 from pg_database where datname = $1', [
  dbName,
]);
if (exists.rowCount === 0) await admin.query(`create database "${dbName}"`);
await admin.end();

const db = new pg.Client({ connectionString: DATABASE_URL });
await db.connect();
await db.query('drop schema public cascade; create schema public');
await db.end();
await rm(MAIL_DIR, { recursive: true, force: true });

const main = fileURLToPath(new URL('../../api/dist/main.js', import.meta.url));
const api = spawn(process.execPath, [main], {
  stdio: 'inherit',
  env: {
    ...process.env,
    SUFFA_ENV: 'dev',
    SUFFA_ROLE: 'api',
    SUFFA_PORT: String(API_PORT),
    SUFFA_DATABASE_URL: DATABASE_URL,
    SUFFA_AUTH_SECRET: randomBytes(32).toString('hex'),
    SUFFA_PUBLIC_URL: WEB_URL,
    SUFFA_MAIL_DIR: MAIL_DIR,
    SUFFA_LOG_LEVEL: 'warn',
  },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => api.kill(signal));
api.on('exit', (code) => process.exit(code ?? 0));
