/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { NETWORK_ONLY_PATTERN } from './src/pwa/runtimeCaching';

// https://vitejs.dev/config/
export default defineConfig({
  // `.env` stays at the repository root (see .env.example), next to the other apps.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png', 'brand/*.svg', 'fonts/*.woff2'],
      manifest: {
        name: 'Suffa – Arabisch lernen',
        short_name: 'Suffa',
        description:
          'Offline-first Lerntrainer für MSA-Arabisch nach „العربية بين يديك“ Buch 1.',
        lang: 'de',
        dir: 'ltr',
        theme_color: '#0f766e',
        background_color: '#0b1120',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Fully precache the app shell + static assets → works offline.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        // Error tracking is only loaded online and only with a DSN set: do not precache.
        // Font subsets for scripts the app does not use; browsers fetch them only on demand.
        globIgnores: [
          '**/sentry-*.js',
          '**/*-{cyrillic,cyrillic-ext,greek,vietnamese}-*.woff2',
        ],
        navigateFallback: 'index.html',
        // Server routes are never answered with the app shell.
        navigateFallbackDenylist: [/^\/api\//, /^\/healthz/, /^\/media\//],
        runtimeCaching: [
          {
            // YouTube: online only, never treat as app shell. The publisher's audio is
            // intentionally not routed through the worker (see src/pwa/runtimeCaching.ts).
            urlPattern: NETWORK_ONLY_PATTERN,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    // Local development: the api runs on :8000 (npm start -w @suffa/api); same-origin like
    // production, so the session cookie works without CORS.
    proxy: { '/api': process.env.SUFFA_API_URL ?? 'http://localhost:8000' },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // Never inline fonts as data: URIs: the CSP allows fonts from 'self' only, and small
    // @fontsource subsets fall under Vite's 4 kB inline limit.
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/i.test(file) ? false : undefined),
    rollupOptions: {
      output: {
        // Heavyweight libraries in their own chunks (better caching).
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          supabase: ['@supabase/supabase-js'],
          db: ['dexie'],
          // The wrapper must go into the chunk too, otherwise it lands in the main bundle and
          // pulls Sentry in statically (modulepreload for everyone, even without error tracking).
          sentry: [
            '@sentry/browser',
            fileURLToPath(new URL('./src/services/sentryClient.ts', import.meta.url)),
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/services/**/*.ts'],
    },
  },
});
