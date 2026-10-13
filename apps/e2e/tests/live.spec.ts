/**
 * Live lessons (ADR-0026) in the browser. Planning works everywhere; without a LiveKit server
 * the teacher learns that live lessons are not set up. The full room (sound and picture,
 * raised hand, floor, chat, ending) runs when the API was started with a LiveKit server
 * (E2E_LIVEKIT=1 and SUFFA_LIVEKIT_URL/_API_KEY/_API_SECRET); camera and microphone are
 * Chromium's fake devices.
 */
import { expect, test, type Page } from '@playwright/test';
import { classWithLearner } from './helpers';

const withLiveKit = process.env.E2E_LIVEKIT === '1';

test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
});

async function plan(teacher: Page, classId: string, title: string) {
  await teacher.goto(`/classes/${classId}?tab=live`);
  await teacher.getByLabel('Thema').fill(title);
  await teacher.getByRole('button', { name: 'Planen' }).click();
  await expect(teacher.getByText(title)).toBeVisible();
}

/** The video on the stage shows moving pictures. */
async function stageIsPlaying(page: Page) {
  await expect
    .poll(
      () =>
        page
          .locator('.live-stage video')
          .evaluate((v: HTMLVideoElement) => v.readyState >= 2 && v.videoWidth > 0)
          .catch(() => false),
      { timeout: 20_000 }
    )
    .toBe(true);
}

test('plans a live lesson that learners see coming', async ({ browser }) => {
  test.skip(withLiveKit, 'covered by the full room test');
  const teacher = await (await browser.newContext()).newPage();
  const learner = await (await browser.newContext()).newPage();
  const { classId } = await classWithLearner(teacher, learner, 'Live E2E Plan');

  await plan(teacher, classId, 'Lektion 5 live');
  await expect(
    teacher.getByText('Live-Unterricht ist auf diesem Server noch nicht eingerichtet.')
  ).toBeVisible();
  await expect(teacher.getByRole('button', { name: 'Starten' })).toBeDisabled();

  // Without a LiveKit server learners see nothing of it.
  await learner.goto(`/classes/${classId}`);
  await expect(learner.getByRole('heading', { name: 'Live E2E Plan' })).toBeVisible();
  await expect(learner.getByText(/Live-Unterricht/)).toHaveCount(0);
});

test('teaches a live lesson: picture, raised hand, floor, chat, end', async ({
  browser,
}) => {
  test.skip(!withLiveKit, 'needs a LiveKit server (E2E_LIVEKIT=1)');
  const media = { permissions: ['camera', 'microphone'] };
  const teacher = await (await browser.newContext(media)).newPage();
  const learner = await (await browser.newContext(media)).newPage();
  const { classId } = await classWithLearner(teacher, learner, 'Live E2E');

  await plan(teacher, classId, 'Lektion 5 live');
  await teacher.getByRole('button', { name: 'Starten' }).click();
  await expect(teacher).toHaveURL(new RegExp(`/classes/${classId}/live/`));
  await teacher.getByRole('button', { name: 'Beitreten' }).click();
  await expect(teacher.getByRole('heading', { name: 'Lektion 5 live' })).toBeVisible();
  await teacher.getByRole('button', { name: 'Kamera an' }).click();
  await teacher.getByRole('button', { name: 'Mikrofon an' }).click();
  await stageIsPlaying(teacher);

  // The learner finds the lesson on the class page and sees the teacher.
  await learner.goto(`/classes/${classId}`);
  await learner.getByRole('link', { name: /Live-Unterricht läuft/ }).click();
  await learner.getByRole('button', { name: 'Beitreten' }).click();
  await expect(learner.getByText('2 im Raum')).toBeVisible();
  await stageIsPlaying(learner);
  await expect(learner.getByRole('button', { name: 'Mikrofon an' })).toHaveCount(0);

  // Raised hand → the teacher gives the floor → the learner's microphone is on.
  await learner.getByRole('button', { name: /Melden/ }).click();
  const hands = teacher.getByRole('region', { name: '2 im Raum' });
  await hands.getByRole('button', { name: 'Wort geben' }).click();
  await expect(learner.getByText('Du hast das Wort.')).toBeVisible();
  await expect(learner.getByRole('button', { name: 'Mikrofon aus' })).toBeVisible();

  // Chat in both directions, Arabic included.
  await learner.getByLabel('Nachricht').fill('السلام عليكم');
  await learner.getByRole('button', { name: 'Senden' }).click();
  await expect(teacher.getByText('السلام عليكم')).toBeVisible();

  // The teacher ends the lesson for everyone.
  teacher.once('dialog', (dialog) => void dialog.accept());
  await teacher.getByRole('button', { name: 'Für alle beenden' }).click();
  await expect(learner.getByText('Der Live-Unterricht ist beendet.')).toBeVisible();
});
