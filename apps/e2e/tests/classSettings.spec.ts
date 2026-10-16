/**
 * Class settings in the browser (stories 18.1/18.2): the teacher picks the class's colours and
 * when practice areas open; the learner's app takes both over.
 */
import { expect, test } from '@playwright/test';
import { classWithLearner } from './helpers';

test('the teacher sets colours and areas; the learner sees both', async ({ browser }) => {
  const teacher = await (await browser.newContext()).newPage();
  const learner = await (await browser.newContext()).newPage();
  const { classId } = await classWithLearner(teacher, learner, 'Farben E2E');

  // A new learner: roots open from unit 3 by default.
  await learner.goto('/training');
  await expect(
    learner.getByText('Öffnet sich, sobald du Einheit 3 erreicht hast.')
  ).toBeVisible();

  await teacher.goto(`/classes/${classId}`);
  await teacher.getByRole('tab', { name: 'Einstellungen' }).click();
  await teacher.getByRole('radio', { name: /Meer/ }).check();
  await expect(teacher.getByText(/Gespeichert/)).toBeVisible();
  await teacher
    .getByRole('combobox', { name: 'Wann öffnet sich Wurzeln?' })
    .selectOption('open');
  await teacher
    .getByRole('combobox', { name: 'Wann öffnet sich Prüfung?' })
    .selectOption('closed');
  await teacher.getByRole('button', { name: 'Freischaltung speichern' }).click();
  await expect(teacher.getByText(/Gespeichert/)).toBeVisible();

  // The learner's app picks it up with the class list (on the next load or sync).
  await learner.goto('/training');
  await expect
    .poll(() => learner.evaluate(() => document.documentElement.dataset.palette))
    .toBe('meer');
  await expect(learner.getByRole('link', { name: /Wurzeln/ })).toBeVisible();
  await expect(
    learner.getByText('Deine Lehrkraft schaltet diesen Bereich noch frei.')
  ).toBeVisible();
  await learner.goto('/exam');
  await expect(learner.getByRole('status')).toContainText('noch frei');

  // The learner may pick their own colours instead.
  await learner.goto('/settings');
  await learner.getByRole('radio', { name: /Lavendel/ }).check();
  await expect
    .poll(() => learner.evaluate(() => document.documentElement.dataset.palette))
    .toBe('lavendel');
});
