/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { createReadStream } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { NETWORK_ONLY_PATTERN } from './src/pwa/runtimeCaching';

/**
 * MediaPipe's WASM for the live room's camera backgrounds (story 18.3), served from our own
 * origin instead of a CDN: copied out of node_modules into dist/live/mediapipe at build time
 * and served from there by the dev server. About 19 MB, so it is never precached; the browser
 * fetches it only when someone picks a background.
 */
function mediapipeWasm(): Plugin {
  const dir = join(
    dirname(createRequire(import.meta.url).resolve('@mediapipe/tasks-vision')),
    'wasm'
  );
  const target = 'live/mediapipe/';
  const allowed = /^vision_wasm_(nosimd_)?internal\.(js|wasm)$/;
  return {
    name: 'suffa-mediapipe-wasm',
    configureServer(server) {
      server.middlewares.use(`/${target}`, (req, res, next) => {
        const name = (req.url ?? '').replace(/^\//, '').split('?')[0] ?? '';
        if (!allowed.test(name)) return next();
        res.setHeader(
          'Content-Type',
          name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript'
        );
        createReadStream(join(dir, name)).pipe(res);
      });
    },
    async generateBundle() {
      for (const name of await readdir(dir)) {
        if (!allowed.test(name)) continue;
        this.emitFile({
          type: 'asset',
          fileName: target + name,
          source: await readFile(join(dir, name)),
        });
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  // `.env` stays at the repository root (see .env.example), next to the other apps.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  plugins: [
    react(),
    mediapipeWasm(),
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
        // Live lessons need the network anyway: their LiveKit client loads when someone joins,
        // the camera backgrounds (MediaPipe, our pictures) when someone picks one.
        globIgnores: [
          '**/sentry-*.js',
          '**/livekit-client*.js',
          '**/track-processors-*.js',
          'live/**',
          '**/*-{cyrillic,cyrillic-ext,greek,vietnamese}-*.woff2',
        ],
        navigateFallback: 'index.html',
        // Push notifications (story 6.3): handlers live in public/push-sw.js.
        importScripts: ['push-sw.js'],
        // Server routes are never answered with the app shell.
        navigateFallbackDenylist: [/^\/api\//, /^\/healthz/, /^\/media\//],
        runtimeCaching: [
          {
            // YouTube: online only, never treat as app shell. The publisher's audio and the
            // video thumbnails are intentionally not routed through the worker (see
            // src/pwa/runtimeCaching.ts).
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
      // The shared rules are used from source: no build step for the app, one copy of the code.
      '@suffa/engagement': fileURLToPath(
        new URL('../../packages/engagement/src/index.ts', import.meta.url)
      ),
      '@suffa/phonology': fileURLToPath(
        new URL('../../packages/phonology/src/index.ts', import.meta.url)
      ),
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
          db: ['dexie'],
          // Camera backgrounds: loaded only when someone picks one, never precached.
          'track-processors': ['@livekit/track-processors'],
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
