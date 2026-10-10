/**
 * Story 16.3: with English picked in the settings, the learner's main pages show no German
 * interface text. Course content (German meanings, unit titles, Medina lesson topics) stays
 * German until story 16.4; it is marked lang="de" where it is rendered and skipped here, as
 * are Arabic (lang="ar") and names that are never translated (translate="no").
 */
import { expect, test, type Page } from '@playwright/test';

/**
 * German interface words that never occur in English text or in the brand: a page that
 * shows one outside course content still has an untranslated label.
 */
const GERMAN_UI_WORDS = [
  'Einstellungen',
  'Weiter',
  'Zurück',
  'Übungen',
  'Einheit',
  'Einheiten',
  'Lektion',
  'Lektionen',
  'Klasse',
  'Fortschritt',
  'Tagesaufgaben',
  'Wiederholen',
  'Wiederholung',
  'erledigt',
  'Anmelden',
  'Abschluss',
  'Abzeichen',
  'Etappe',
  'gesperrt',
  'Lernpfad',
  'Wochenziel',
];

interface Hit {
  word: string;
  text: string;
  where: string;
}

/** German interface words on the page outside content marked lang="de"/"ar" or translate="no". */
async function germanInterfaceText(page: Page): Promise<Hit[]> {
  return page.evaluate((words) => {
    const pattern = new RegExp(`(?<![\\p{L}])(${words.join('|')})(?![\\p{L}])`, 'u');
    const EXEMPT = '[lang^="de"], [lang^="ar"], [translate="no"]';
    const SKIP = 'script, style, noscript, template';
    const hits: { word: string; text: string; where: string }[] = [];
    const describe = (el: Element) => {
      const parts: string[] = [];
      for (let e: Element | null = el; e && parts.length < 4; e = e.parentElement) {
        parts.unshift(
          e.tagName.toLowerCase() +
            (e.className && typeof e.className === 'string'
              ? `.${e.className.trim().split(/\s+/).join('.')}`
              : '')
        );
      }
      return parts.join(' > ');
    };
    const shown = (el: Element) =>
      typeof el.checkVisibility === 'function' ? el.checkVisibility() : true;
    const check = (text: string, el: Element) => {
      const match = pattern.exec(text);
      if (match)
        hits.push({
          word: match[1]!,
          text: text.trim().slice(0, 80),
          where: describe(el),
        });
    };

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || el.closest(EXEMPT) || el.closest(SKIP) || !shown(el)) continue;
      check(node.textContent ?? '', el);
    }
    // The attributes people read or hear. A label may name content shown elsewhere on the
    // page ("Play <video title>"); text that is marked as content there is left out.
    const content = Array.from(document.body.querySelectorAll(EXEMPT))
      .map((el) => (el.textContent ?? '').trim())
      .filter((text) => text.length >= 3)
      .sort((a, b) => b.length - a.length);
    for (const el of Array.from(
      document.body.querySelectorAll('[aria-label], [title], [placeholder], [alt]')
    )) {
      if (el.closest(EXEMPT) || !shown(el)) continue;
      for (const name of ['aria-label', 'title', 'placeholder', 'alt']) {
        let value = el.getAttribute(name);
        if (!value) continue;
        for (const text of content) value = value.split(text).join(' ');
        check(value, el);
      }
    }
    return hits;
  }, GERMAN_UI_WORDS);
}

/** Opens a page, waits for its lazy parts and fails on German interface text. */
async function expectEnglish(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('main')).toBeVisible();
  await page.waitForLoadState('networkidle');
  // Lazy chunks and IndexedDB reads settle after the network.
  await page.waitForTimeout(500);
  expect(await page.locator('html').getAttribute('lang')).toBe('en');
  const hits = await germanInterfaceText(page);
  expect(
    hits.map((h) => `${path}: "${h.word}" in "${h.text}" (${h.where})`),
    `German interface text on ${path}`
  ).toEqual([]);
}

test('shows the learner pages in English, without German interface text', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // Without an account: learning stays on this device.
  if (new URL(page.url()).pathname === '/login') {
    await page.getByRole('button', { name: /Ohne Konto weiter/ }).click();
  }
  await page.goto('/settings');
  await page.getByLabel(/Sprache der Oberfläche/).selectOption('en');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();

  for (const path of [
    '/',
    '/units',
    '/review',
    '/videos',
    '/discover',
    '/exam',
    '/alphabet',
    '/alphabet/1',
    '/more',
    '/settings',
  ]) {
    await expectEnglish(page, path);
  }

  // A unit: the pace picker, then the learning path.
  await expectEnglish(page, '/units/1');
  await page.getByRole('button', { name: 'Start unit 1' }).click();
  await expect(page.getByRole('list', { name: 'Learning path, unit 1' })).toBeVisible();
  await expectEnglish(page, '/units/1');

  // The Medina course: switched on the level map, its path and a lesson.
  await page.goto('/units');
  await page
    .getByRole('group', { name: 'Course' })
    .getByRole('button', { name: 'Medina course' })
    .click();
  await expect(
    page
      .getByRole('group', { name: 'Course' })
      .getByRole('button', { name: 'Medina course' })
  ).toHaveAttribute('aria-pressed', 'true');
  await expectEnglish(page, '/units');
  await expectEnglish(page, '/units/madinah/1');
  await expectEnglish(page, '/');
});
