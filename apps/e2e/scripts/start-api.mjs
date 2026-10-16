/**
 * Starts the real API for the browser tests on a wiped database. Sign-in links go to files
 * in MAIL_DIR (FileMailer), which the tests read. Refuses anything that looks like a real
 * database: the name must end in "_e2e".
 *
 * With E2E_EGRESS=1 (recording live lessons, ADR-0029) a worker runs next to the API: it
 * follows the recording until its file is stored and transcodes it. The S3 settings
 * (SUFFA_S3_*) then point at a throwaway store; its media bucket is created here.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { API_PORT, API_URL, DATABASE_URL, MAIL_DIR, WEB_URL } from './env.mjs';

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

const withEgress = process.env.E2E_EGRESS === '1';
if (withEgress) await createMediaBucket();

const main = fileURLToPath(new URL('../../api/dist/main.js', import.meta.url));
const env = {
  ...process.env,
  SUFFA_ENV: 'dev',
  SUFFA_DATABASE_URL: DATABASE_URL,
  SUFFA_AUTH_SECRET: randomBytes(32).toString('hex'),
  SUFFA_PUBLIC_URL: WEB_URL,
  SUFFA_MAIL_DIR: MAIL_DIR,
  SUFFA_LOG_LEVEL: 'warn',
  ...(withEgress
    ? { SUFFA_LIVE_RECORDING_TEMPLATE_URL: `${WEB_URL}/live-record.html` }
    : {}),
};
const api = spawn(process.execPath, [main], {
  stdio: 'inherit',
  env: { ...env, SUFFA_ROLE: 'api', SUFFA_PORT: String(API_PORT) },
});
const children = [api];
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => children.forEach((child) => child.kill(signal)));
}
api.on('exit', (code) => process.exit(code ?? 0));

if (withEgress) {
  // The worker checks the schema revision: start it once the API has migrated.
  await waitFor(`${API_URL}/healthz`);
  const worker = spawn(process.execPath, [main], {
    stdio: 'inherit',
    env: { ...env, SUFFA_ROLE: 'worker' },
  });
  children.push(worker);
  worker.on('exit', (code) => {
    console.error(`worker exited (${code})`);
    api.kill('SIGTERM');
  });
}

async function waitFor(url) {
  for (let i = 0; i < 120; i++) {
    const ok = await fetch(url)
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) return;
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`${url} did not come up`);
}

async function createMediaBucket() {
  const { CreateBucketCommand, S3Client } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    endpoint: process.env.SUFFA_S3_ENDPOINT,
    region: process.env.SUFFA_S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.SUFFA_S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.SUFFA_S3_SECRET_ACCESS_KEY ?? '',
    },
  });
  await client
    .send(
      new CreateBucketCommand({
        Bucket: process.env.SUFFA_S3_BUCKET_MEDIA ?? 'suffa-media',
      })
    )
    .catch((error) => {
      if (error?.name !== 'BucketAlreadyOwnedByYou') throw error;
    });
}
