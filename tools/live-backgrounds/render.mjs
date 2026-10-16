/**
 * Renders the live-room backgrounds (designs.mjs) to JPEG in apps/web/public/live/backgrounds.
 * Run it after changing a design and commit the pictures:
 *
 *   node tools/live-backgrounds/render.mjs
 *
 * Uses the Chromium that Playwright already installs for the e2e tests.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { DESIGNS, HEIGHT, WIDTH } from './designs.mjs';

const out = fileURLToPath(
  new URL('../../apps/web/public/live/backgrounds/', import.meta.url)
);
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  for (const [id, draw] of Object.entries(DESIGNS)) {
    await page.setContent(
      `<!doctype html><html><body style="margin:0">${draw()}</body></html>`
    );
    const picture = await page.screenshot({ type: 'jpeg', quality: 84 });
    await writeFile(`${out}${id}.jpg`, picture);
    console.log(`${id}.jpg: ${Math.round(picture.length / 1024)} kB`);
  }
} finally {
  await browser.close();
}
