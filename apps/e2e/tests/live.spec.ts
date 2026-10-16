/**
 * Live lessons (ADR-0026) in the browser. Planning works everywhere; without a LiveKit server
 * the teacher learns that live lessons are not set up. The full room (sound and picture,
 * raised hand, floor, chat, ending) runs when the API was started with a LiveKit server
 * (E2E_LIVEKIT=1 and SUFFA_LIVEKIT_URL/_API_KEY/_API_SECRET); camera and microphone are
 * Chromium's fake devices. Sisters' and brothers' sessions (stage 2) reach only their section
 * and may keep the learners' cameras off.
 */
import { expect, test, type Page } from '@playwright/test';
import { classWithLearner } from './helpers';

const withLiveKit = process.env.E2E_LIVEKIT === '1';

test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
});

async function plan(
  teacher: Page,
  classId: string,
  title: string,
  { audience, camerasOff = false }: { audience?: string; camerasOff?: boolean } = {}
) {
  await teacher.goto(`/classes/${classId}?tab=live`);
  await teacher.getByLabel('Thema').fill(title);
  if (audience) await teacher.getByLabel('Für').selectOption({ label: audience });
  if (camerasOff) await teacher.getByLabel(/Kameras der Lernenden bleiben aus/).check();
  await teacher.getByRole('button', { name: 'Planen' }).click();
  await expect(teacher.getByText(title)).toBeVisible();
}

/** The teacher puts the class's learner with the sisters or the brothers. */
async function assignSection(teacher: Page, classId: string, section: string) {
  await teacher.goto(`/classes/${classId}?tab=members`);
  const select = teacher.getByRole('combobox', { name: /Bereich von/ });
  await select.selectOption({ label: section });
  await expect(select).toHaveValue(section === 'Schwestern' ? 'sisters' : 'brothers');
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

  // A sisters' lesson with the learners' cameras off carries both as tags.
  await assignSection(teacher, classId, 'Schwestern');
  await plan(teacher, classId, 'Tajwid für Schwestern', {
    audience: 'Schwestern',
    camerasOff: true,
  });
  const item = teacher.locator('li').filter({ hasText: 'Tajwid für Schwestern' });
  await expect(item.getByText('Schwestern', { exact: true })).toBeVisible();
  await expect(item.getByText('Kameras der Lernenden aus')).toBeVisible();

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

test('a sisters’ lesson: only the sisters join, with their voice only', async ({
  browser,
}) => {
  test.skip(!withLiveKit, 'needs a LiveKit server (E2E_LIVEKIT=1)');
  const media = { permissions: ['camera', 'microphone'] };
  const teacher = await (await browser.newContext(media)).newPage();
  const learner = await (await browser.newContext(media)).newPage();
  const { classId } = await classWithLearner(teacher, learner, 'Live E2E Schwestern');
  await assignSection(teacher, classId, 'Schwestern');

  await plan(teacher, classId, 'Nur für Brüder', { audience: 'Brüder' });
  await plan(teacher, classId, 'Schwestern-Runde', {
    audience: 'Schwestern',
    camerasOff: true,
  });
  await teacher
    .locator('li')
    .filter({ hasText: 'Schwestern-Runde' })
    .getByRole('button', { name: 'Starten' })
    .click();
  await teacher.getByRole('button', { name: 'Beitreten' }).click();
  await expect(teacher.getByRole('heading', { name: 'Schwestern-Runde' })).toBeVisible();

  // The sister sees her lesson, never the brothers' one.
  await learner.goto(`/classes/${classId}`);
  await learner
    .getByRole('link', { name: /Live-Unterricht läuft: Schwestern-Runde/ })
    .click();
  await expect(learner.getByText('Nur für Brüder')).toHaveCount(0);
  await learner.getByRole('button', { name: 'Beitreten' }).click();
  await expect(learner.getByText('2 im Raum')).toBeVisible();

  // Given the floor, she speaks; her camera stays off.
  await learner.getByRole('button', { name: /Melden/ }).click();
  await teacher
    .getByRole('region', { name: '2 im Raum' })
    .getByRole('button', { name: 'Wort geben' })
    .click();
  await expect(learner.getByText('Du hast das Wort.')).toBeVisible();
  await expect(learner.getByRole('button', { name: 'Mikrofon aus' })).toBeVisible();
  await expect(learner.getByRole('button', { name: 'Kamera an' })).toHaveCount(0);
});

test('the teacher’s camera with a background, small beside the shared screen', async ({
  browser,
}) => {
  test.skip(!withLiveKit, 'needs a LiveKit server (E2E_LIVEKIT=1)');
  const media = { permissions: ['camera', 'microphone'] };
  const teacher = await (await browser.newContext(media)).newPage();
  const learner = await (await browser.newContext(media)).newPage();
  const { classId } = await classWithLearner(teacher, learner, 'Live E2E Hintergrund');

  await plan(teacher, classId, 'Lektion 6 live');
  await teacher.getByRole('button', { name: 'Starten' }).click();
  await teacher.getByRole('button', { name: 'Beitreten' }).click();
  await teacher.getByRole('button', { name: 'Kamera an' }).click();
  await stageIsPlaying(teacher);

  // The background is worked out in the teacher's browser, with files from our own server.
  const fromElsewhere: string[] = [];
  teacher.on('request', (request) => {
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) fromElsewhere.push(url.host);
  });
  await teacher.getByText('Hintergrund: Keiner').click();
  await teacher.getByText('Moschee am Abend').click();
  await expect(teacher.getByRole('radio', { name: 'Moschee am Abend' })).toBeChecked();
  await expect(teacher.getByRole('radio', { name: 'Moschee am Abend' })).toBeEnabled({
    timeout: 30_000,
  });
  await expect(teacher.getByText(/ließ sich nicht einschalten/)).toHaveCount(0);
  expect(fromElsewhere).toEqual([]);

  // Started again with the background chosen: it is in place before the camera is published.
  await teacher.getByRole('button', { name: 'Kamera aus' }).click();
  await teacher.getByRole('button', { name: 'Kamera an' }).click();
  await expect(teacher.getByText(/Kamera bleibt aus/)).toHaveCount(0);
  await stageIsPlaying(teacher);

  await learner.goto(`/classes/${classId}`);
  await learner.getByRole('link', { name: /Live-Unterricht läuft/ }).click();
  await learner.getByRole('button', { name: 'Beitreten' }).click();
  await stageIsPlaying(learner);

  // Sharing the screen: the camera moves to the corner, and the learner can hide it.
  await teacher.getByRole('button', { name: 'Bildschirm teilen' }).click();
  await expect(learner.getByLabel(/Bildschirm von/)).toBeVisible({ timeout: 20_000 });
  await expect(learner.locator('.live-pip video')).toBeVisible();
  await learner.getByRole('button', { name: 'Lehrkraft ausblenden' }).click();
  await expect(learner.locator('.live-pip')).toHaveCount(0);
});
