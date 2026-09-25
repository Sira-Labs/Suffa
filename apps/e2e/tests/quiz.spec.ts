import { expect, test } from '@playwright/test';
import { classWithLearner } from './helpers';

test('runs a live quiz: projector for the teacher, phone for the learner', async ({
  browser,
}) => {
  const teacher = await (await browser.newContext()).newPage();
  const learner = await (
    await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true })
  ).newPage();
  const { classId } = await classWithLearner(teacher, learner, 'Quiz E2E');

  await teacher.goto(`/classes/${classId}/quiz`);
  await teacher.getByRole('button', { name: 'Quiz starten' }).click();
  await expect(teacher.getByText('0 Lernende sind dabei.')).toBeVisible();

  // The learner finds the running quiz on the class page and joins.
  await learner.goto(`/classes/${classId}`);
  await learner.getByRole('link', { name: /Live-Quiz läuft/ }).click();
  await learner.getByRole('button', { name: 'Mitmachen' }).click();
  await expect(learner.getByText(/Gleich geht es los/)).toBeVisible();
  // The projector learns about the new player through its event stream.
  await expect(teacher.getByText('1 Lernende sind dabei.')).toBeVisible();

  await teacher.getByRole('button', { name: 'Erste Frage zeigen' }).click();
  const answers = learner.getByRole('group', { name: 'Antworten' }).getByRole('button');
  await expect(answers).toHaveCount(4);
  await answers.first().click();
  await expect(learner.getByText(/Antwort gespeichert/)).toBeVisible();
  await expect(teacher.getByText(/1 von 1 geantwortet/)).toBeVisible();

  await teacher.getByRole('button', { name: 'Auflösen' }).click();
  await expect(learner.getByText(/Richtig!|Leider falsch/)).toBeVisible();
  await expect(learner.getByRole('list', { name: 'Bestenliste' })).toBeVisible();

  await teacher.getByRole('button', { name: 'Quiz beenden' }).click();
  await expect(learner.getByText(/Geschafft! Du hast \d+ Punkte/)).toBeVisible();
});
