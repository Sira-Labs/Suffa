import { expect, test } from '@playwright/test';
import { newEmail, signedInOnSettings } from './helpers';

/**
 * Passkeys with Chromium's virtual authenticator (a platform authenticator that verifies the
 * user, like Touch ID): add one in the settings, sign out, sign in with one tap, remove it.
 */
test('adds a passkey, signs in with it and removes it', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  const email = newEmail('passkey');
  await signedInOnSettings(page, email);
  await page.getByRole('button', { name: 'Passkey hinzufügen' }).click();
  await expect(page.getByText(/Passkey hinzugefügt/)).toBeVisible();
  await expect(page.getByText(/hinzugefügt am/)).toHaveCount(1);

  await page.getByRole('button', { name: 'Abmelden', exact: true }).first().click();
  await page.goto('/login?next=%2Fvocab');
  await page.getByRole('button', { name: /Mit Passkey anmelden/ }).click();
  await expect(page).toHaveURL(/\/vocab$/);
  const me = await page.request.get('/api/v1/me');
  expect(await me.json()).toMatchObject({ email });

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Entfernen' }).click();
  await expect(page.getByText('✓ Passkey entfernt.')).toBeVisible();
  await expect(page.getByText(/hinzugefügt am/)).toHaveCount(0);
});
