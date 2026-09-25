import { expect, test } from '@playwright/test';
import { newEmail, signedInOnSettings, sql } from './helpers';

test('a setting changed on one device arrives on another @mobile', async ({
  browser,
}) => {
  const email = newEmail('zwei-geraete');
  const phone = await (await browser.newContext()).newPage();
  const laptop = await (await browser.newContext()).newPage();

  await signedInOnSettings(phone, email);
  await phone.getByLabel(/Wochenziel/).selectOption('3');
  await phone.getByRole('button', { name: 'Sofort abgleichen' }).click();
  // The server has the new weekly goal …
  await expect
    .poll(async () => {
      const rows = await sql<{ goal: number }>(
        `select s."weeklyGoal" as goal from settings s join users u on u.id = s.user_id
          where lower(u.email) = lower($1) and not s.deleted`,
        [email]
      );
      return rows[0]?.goal ?? null;
    })
    .toBe(3);

  // … and the second device pulls it after signing in with the same account.
  await signedInOnSettings(laptop, email);
  await expect
    .poll(async () => {
      await laptop.reload();
      return laptop.getByLabel(/Wochenziel/).inputValue();
    })
    .toBe('3');
});
