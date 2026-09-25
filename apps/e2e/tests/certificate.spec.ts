import { expect, test } from '@playwright/test';
import { classWithLearner, sql, unitWordIds } from './helpers';

test('a teacher awards a unit certificate, prints it, and the learner sees it', async ({
  browser,
}) => {
  const teacher = await (await browser.newContext()).newPage();
  const learner = await (await browser.newContext()).newPage();
  const { classId, learnerEmail } = await classWithLearner(
    teacher,
    learner,
    'Urkunden E2E'
  );

  // The learner knows every word of unit 1 firmly (mature cards, as after weeks of review);
  // newer than the device's own copies, so the next sync keeps them.
  const words = await unitWordIds(1);
  await sql(
    `insert into srs_cards (user_id, id, "contentRef", kind, interval, ease, reps, lapses, due,
                            "lastReviewed", leech, updated_at, deleted)
     select u.id, 'vocab_ar_de:' || w, w, 'vocab_ar_de', 30, 2.5, 6, 0, now() + interval '30 days',
            now(), false, now() + interval '1 day', false
       from users u, unnest($2::text[]) as w
      where lower(u.email) = lower($1)
     on conflict (user_id, id) do update
       set interval = 30, due = excluded.due, updated_at = excluded.updated_at,
           deleted = false`,
    [learnerEmail, words]
  );

  await teacher.goto(`/classes/${classId}`);
  await teacher.getByRole('tab', { name: 'Zertifikate' }).click();
  const ready = teacher.getByRole('region', { name: 'Bereit für ein Zertifikat' });
  await expect(ready.getByText(/Einheit 1 .* 100 %/)).toBeVisible();
  await ready.getByRole('button', { name: 'Vergeben' }).click();

  const awarded = teacher.getByRole('region', { name: 'Vergebene Zertifikate' });
  await expect(awarded.getByText(/Einheit 1/)).toBeVisible();
  // Printing opens the browser dialog; here we only note that it was asked for.
  await teacher.evaluate(() => {
    window.print = () => document.body.setAttribute('data-printed', 'yes');
  });
  await awarded.getByRole('button', { name: 'Drucken' }).click();
  // The sheet is only visible to the printer (print CSS), so it is found by its label.
  const sheet = teacher.locator('article[aria-label="Zertifikat Einheit 1"]');
  await expect(sheet).toBeAttached();
  await expect(sheet).toContainText('Urkunde');
  await expect(sheet).toContainText('100 % der Wörter');
  await expect(teacher.locator('body')).toHaveAttribute('data-printed', 'yes');

  await learner.goto('/badges');
  await expect(learner.getByRole('heading', { name: 'Zertifikate' })).toBeVisible();
  await expect(learner.getByText('Einheit 1 abgeschlossen')).toBeVisible();
});
