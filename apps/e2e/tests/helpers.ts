/** Shared steps: sign in through the real magic link, and set up roles in the database. */
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import pg from 'pg';
import { DATABASE_URL, MAIL_DIR } from '../scripts/env.mjs';

let unique = 0;
/** A fresh address per test run, so tests never meet each other's accounts. */
export function newEmail(name: string): string {
  return `${name}-${Date.now().toString(36)}-${unique++}@example.org`;
}

/** Waits for the sign-in link the API writes for this address. */
async function magicLink(email: string): Promise<string> {
  const file = join(MAIL_DIR, `${email.toLowerCase()}.txt`);
  for (let i = 0; i < 50; i++) {
    try {
      const url = (await readFile(file, 'utf8')).trim();
      if (url.startsWith('http')) return url;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`no sign-in link for ${email}`);
}

/**
 * Asks for a sign-in link on the current page's form (settings or an invitation) and opens
 * it, as a learner would from the mail.
 */
export async function signIn(page: Page, email: string, from?: string) {
  if (from) await page.goto(from);
  await rm(join(MAIL_DIR, `${email.toLowerCase()}.txt`), { force: true });
  await page.getByLabel('E-Mail-Adresse').fill(email);
  await page.getByRole('button', { name: 'Link senden' }).click();
  await page.goto(await magicLink(email));
}

export async function signedInOnSettings(page: Page, email: string) {
  await signIn(page, email, '/settings');
  await expect(page.getByText(/Du bist angemeldet/)).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
}

/** Gives an account a platform role (as an admin would in the admin area). */
export async function setRole(email: string, role: 'student' | 'teacher' | 'admin') {
  const db = new pg.Client({ connectionString: DATABASE_URL });
  await db.connect();
  try {
    const result = await db.query(
      'update users set role = $2 where lower(email) = lower($1)',
      [email, role]
    );
    if (result.rowCount !== 1) throw new Error(`no account ${email}`);
  } finally {
    await db.end();
  }
}

/**
 * A class with a teacher and one approved learner, set up through the app itself: the teacher
 * creates the class and an invitation, the learner signs in from the invitation and asks to
 * join, the teacher approves. Returns both pages (separate browser contexts) and the class id.
 */
export async function classWithLearner(
  teacher: Page,
  learner: Page,
  className: string
): Promise<{ classId: string; teacherEmail: string; learnerEmail: string }> {
  const teacherEmail = newEmail('lehrkraft');
  const learnerEmail = newEmail('lernende');
  await signedInOnSettings(teacher, teacherEmail);
  await setRole(teacherEmail, 'teacher');

  await teacher.goto('/classes');
  await teacher.getByLabel('Name der neuen Klasse').fill(className);
  await teacher.getByRole('button', { name: 'Anlegen' }).click();
  await teacher.getByRole('link', { name: new RegExp(className) }).click();
  await expect(teacher).toHaveURL(/\/classes\/[0-9a-f-]{36}$/);
  const classId = teacher.url().split('/').pop()!;

  await teacher.getByRole('tab', { name: 'Mitglieder' }).click();
  await teacher.getByRole('button', { name: /Einladungslink/ }).click();
  const invite = (await teacher
    .locator('code')
    .filter({ hasText: '/join/' })
    .textContent())!;
  const invitePath = new URL(invite).pathname;

  await learner.goto(invitePath);
  await signIn(learner, learnerEmail);
  await expect(learner).toHaveURL(new RegExp(`${invitePath}$`));
  await learner.getByRole('button', { name: 'Beitreten' }).click();
  await expect(learner.getByText(/Anfrage geschickt/)).toBeVisible();

  await teacher.reload();
  await teacher.getByRole('tab', { name: 'Mitglieder' }).click();
  await teacher.getByRole('button', { name: 'Freigeben' }).click();
  await expect(teacher.getByRole('button', { name: 'Freigeben' })).toHaveCount(0);
  return { classId, teacherEmail, learnerEmail };
}

/** Runs one query against the test database (for data a real learner would build up slowly). */
export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  const db = new pg.Client({ connectionString: DATABASE_URL });
  await db.connect();
  try {
    return (await db.query<T>(query, params)).rows;
  } finally {
    await db.end();
  }
}

/** The course word ids of a unit, as the app and the server know them. */
export async function unitWordIds(unit: number): Promise<string[]> {
  const file = new URL(
    `../../web/src/content/units/einheit-${String(unit).padStart(2, '0')}.json`,
    import.meta.url
  );
  const content = JSON.parse(await readFile(file, 'utf8')) as {
    vokabeln: { id: string }[];
  };
  return content.vokabeln.map((w) => w.id);
}
