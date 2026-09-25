import { expect, test } from '@playwright/test';
import { classWithLearner } from './helpers';

test('a teacher invites a learner, approves them, and both see the class', async ({
  browser,
}) => {
  const teacher = await (await browser.newContext()).newPage();
  const learner = await (await browser.newContext()).newPage();
  const { classId } = await classWithLearner(teacher, learner, 'Arabisch E2E');

  // The teacher's dashboard lists the learner; the learner sees the class life.
  await teacher.goto(`/classes/${classId}`);
  await expect(teacher.getByRole('table')).toBeVisible();

  await learner.goto('/classes');
  await learner.getByRole('link', { name: /Arabisch E2E/ }).click();
  await expect(learner).toHaveURL(new RegExp(`/classes/${classId}$`));
  await expect(learner.getByRole('tab')).toHaveCount(0);
});
