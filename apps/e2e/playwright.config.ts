/**
 * Browser tests (Playwright): the production build of the app (vite preview, which forwards
 * /api like Caddy does) against the real API on a fresh database. Desktop Chrome runs every
 * flow; a phone profile runs the ones tagged @mobile.
 */
import { defineConfig, devices } from '@playwright/test';
import { API_URL, WEB_PORT, WEB_URL } from './scripts/env.mjs';

export default defineConfig({
  testDir: './tests',
  // Flows share one database; they run one after another.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_URL,
    locale: 'de-DE',
    timezoneId: 'Europe/Zurich',
    // The service worker would serve cached app shells between tests.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: [
    {
      command: 'node scripts/start-api.mjs',
      url: `${API_URL}/healthz`,
      timeout: 60_000,
      reuseExistingServer: false,
    },
    {
      command: `npm run preview -w @suffa/web -- --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      cwd: '../..',
      url: WEB_URL,
      timeout: 60_000,
      reuseExistingServer: false,
      env: { SUFFA_API_URL: API_URL },
    },
  ],
});
