/**
 * Accessibility (story 16.5, WCAG 2.2 AA): axe checks every main page in the dark and the
 * light theme, for a learner without an account and for a signed-in teacher, and fails on any
 * serious or critical finding. The keyboard checks cover the skip link, visible focus and the
 * main navigation. The manual screen-reader pass is written down in docs/accessibility.md.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { classWithLearner } from './helpers';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

interface Finding {
  page: string;
  rule: string;
  impact: string;
  help: string;
  targets: string[];
}

/** Serious and critical axe findings on the current page (moderate ones go to the audit). */
async function audit(page: Page, label: string): Promise<Finding[]> {
  // Animations and lazy content settle first: axe reads colours and names as they are now.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      page: label,
      rule: v.id,
      impact: v.impact ?? '',
      help: v.help,
      targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
    }));
}

function report(findings: Finding[]): string[] {
  return findings.map(
    (f) => `${f.page}: [${f.impact}] ${f.rule} – ${f.help} → ${f.targets.join(' | ')}`
  );
}

/** Goes on without an account (the sign-in page comes first). */
async function withoutAccount(page: Page) {
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole('button', { name: /Ohne Konto weiter/ }).click();
  await expect(page).toHaveURL(/\/settings$/);
}

const LEARNER_PAGES = [
  '/',
  '/units',
  '/units/1',
  '/units/1/read',
  '/units/1/write',
  '/units/1/listen',
  '/review',
  '/vocab',
  '/exam',
  '/alphabet',
  '/alphabet/1',
  '/roots',
  '/conjugation',
  '/speaking',
  '/videos',
  '/discover',
  '/library',
  '/progress',
  '/badges',
  '/more',
  '/settings',
  '/sources',
  '/tutor',
];

for (const theme of ['dark', 'light'] as const) {
  test(`learner pages have no serious WCAG findings (${theme} theme)`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const findings: Finding[] = [];
    await page.goto('/login');
    findings.push(...(await audit(page, `/login (${theme})`)));
    await withoutAccount(page);
    const current = await page.evaluate(() => document.documentElement.dataset.theme);
    if (current !== theme) {
      await page.getByRole('button', { name: /umschalten/ }).click();
    }
    await page.goto('/units/1');
    // A unit not started yet asks for the pace first; the path is audited after it.
    const start = page.getByRole('button', { name: /Einheit starten/ });
    if (await start.count())
      findings.push(...(await audit(page, `/units/1 pace (${theme})`)));
    for (const path of LEARNER_PAGES) {
      await page.goto(path);
      findings.push(...(await audit(page, `${path} (${theme})`)));
    }
    // The Medina course has its own pages.
    await page.goto('/units');
    await page
      .getByRole('group', { name: 'Kurs' })
      .getByRole('button', { name: /Medina/ })
      .click();
    for (const path of ['/', '/units', '/units/madinah/1', '/exam']) {
      await page.goto(path);
      findings.push(...(await audit(page, `${path} Medina (${theme})`)));
    }
    expect(report(findings), 'serious or critical axe findings').toEqual([]);
  });
}

test('teacher pages have no serious WCAG findings', async ({ browser }) => {
  test.setTimeout(240_000);
  const teacherContext = await browser.newContext();
  const learnerContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  const learner = await learnerContext.newPage();
  const { classId } = await classWithLearner(teacher, learner, 'Barrierefrei 1');
  const findings: Finding[] = [];
  for (const path of ['/', '/classes', `/classes/${classId}`, '/settings', '/inhalte']) {
    await teacher.goto(path);
    findings.push(...(await audit(teacher, path)));
  }
  for (const tab of [
    'Fortschritt',
    'Aufgaben',
    'Klassenleben',
    'Aufnahmen',
    'Mitglieder',
  ]) {
    await teacher.goto(`/classes/${classId}`);
    const button = teacher.getByRole('tab', { name: tab });
    if (await button.count()) {
      await button.click();
      findings.push(...(await audit(teacher, `/classes/:id ${tab}`)));
    }
  }
  await learner.goto('/');
  findings.push(...(await audit(learner, '/ (learner in a class)')));
  await learner.goto('/classes');
  findings.push(...(await audit(learner, '/classes (learner)')));
  expect(report(findings), 'serious or critical axe findings').toEqual([]);
  await teacherContext.close();
  await learnerContext.close();
});

test('the keyboard reaches the content first and always shows where it is', async ({
  page,
}) => {
  await withoutAccount(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // The first Tab lands on the skip link, which jumps past the navigation.
  await page.keyboard.press('Tab');
  const skip = page.locator(':focus');
  await expect(skip).toHaveText(/Zum Inhalt springen/);
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();

  // Every focused control shows a visible focus indicator.
  const unmarked: string[] = [];
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    const shown = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return { ok: true, name: 'body' };
      const style = getComputedStyle(el);
      const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
      const ring = style.boxShadow && style.boxShadow !== 'none';
      return {
        ok: outline || Boolean(ring),
        name: `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}"`,
      };
    });
    if (!shown.ok) unmarked.push(shown.name);
  }
  expect(unmarked, 'controls without a visible focus indicator').toEqual([]);
});

test('reflows at 320 px without horizontal scrolling', async ({ browser }) => {
  test.setTimeout(120_000);
  // WCAG 1.4.10: 320 CSS px wide is the 400 % zoom of a 1280 px screen.
  const context = await browser.newContext({ viewport: { width: 320, height: 640 } });
  const page = await context.newPage();
  await withoutAccount(page);
  const wide: string[] = [];
  for (const path of [
    '/',
    '/units',
    '/units/1',
    '/review',
    '/exam',
    '/alphabet',
    '/settings',
    '/more',
  ]) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    if (overflow > 1) wide.push(`${path}: ${overflow}px`);
  }
  expect(wide, 'pages wider than the screen').toEqual([]);
  await context.close();
});
