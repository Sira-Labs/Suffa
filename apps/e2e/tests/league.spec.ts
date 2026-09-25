import { expect, test } from '@playwright/test';
import { classWithLearner, sql } from './helpers';

test('the weekly league: off until the teacher allows it, then opt-in for learners', async ({
  browser,
}) => {
  const teacher = await (await browser.newContext()).newPage();
  const learner = await (await browser.newContext()).newPage();
  const { classId, learnerEmail } = await classWithLearner(teacher, learner, 'Liga E2E');

  // Off by default: learners do not see it at all.
  await learner.goto(`/classes/${classId}`);
  await expect(learner.getByText(/Gemeinsam|Challenge|Shout-outs/).first()).toBeVisible();
  await expect(learner.getByRole('heading', { name: 'Wochenliga' })).toHaveCount(0);

  await teacher.goto(`/classes/${classId}`);
  await teacher.getByRole('tab', { name: 'Klassenleben' }).click();
  await teacher.getByLabel(/Liga einschalten/).click();
  await expect(teacher.getByLabel(/Liga einschalten/)).toBeChecked();

  // One learning day this week (a finished daily quest), then the learner opts in.
  await sql(
    `insert into quest_progress (user_id, day, quest_id, progress, target, completed_at)
     select u.id, (now() at time zone coalesce(u.time_zone, 'UTC'))::date, 'review', 1, 1, now()
       from users u where lower(u.email) = lower($1)`,
    [learnerEmail]
  );
  await learner.reload();
  await expect(learner.getByRole('heading', { name: 'Wochenliga' })).toBeVisible();
  await learner.getByLabel('Ich mache mit').click();
  await expect(learner.getByLabel('Ich mache mit')).toBeChecked();
  const podium = learner.getByRole('list', { name: 'Podest dieser Woche' });
  await expect(podium).toContainText('Du');
  await expect(podium).toContainText('20 %');
});
