import { expect, test } from '@playwright/test';
import { newEmail, signedInOnSettings } from './helpers';

test('signs in with the magic link and stays signed in @mobile', async ({ page }) => {
  const email = newEmail('anmeldung');
  await signedInOnSettings(page, email);

  // The session survives a reload (httpOnly cookie on the app's own origin).
  await page.reload();
  await expect(page.getByText(email)).toBeVisible();

  // The start page works signed in, and the server answers for the account.
  await page.goto('/');
  await expect(page.getByRole('navigation').first()).toBeVisible();
  const me = await page.request.get('/api/v1/me');
  expect(me.status()).toBe(200);
  expect(await me.json()).toMatchObject({ email, role: 'student' });
});

test('explains an invalid sign-in link', async ({ page }) => {
  await page.goto(
    '/api/v1/auth/magic-link/verify?token=not-a-token&callbackURL=%2Fsettings'
  );
  await expect(
    page.getByText(/abgelaufen oder wurde schon benutzt|hat nicht geklappt/)
  ).toBeVisible();
});

test('shows the sign-in page first, and lets a learner go on without an account @mobile', async ({
  page,
}) => {
  await page.goto('/vocab');
  await expect(page).toHaveURL(/\/login\?next=%2Fvocab$/);
  await expect(page.getByRole('heading', { name: 'Bei Suffa anmelden' })).toBeVisible();

  await page.getByRole('button', { name: /Ohne Konto weiter/ }).click();
  await expect(page).toHaveURL(/\/vocab$/);
  // Remembered on this device; the header still offers the sign-in.
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: 'Anmelden' }).first()).toBeVisible();
});
