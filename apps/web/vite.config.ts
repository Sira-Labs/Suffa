/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

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
        // App-Shell + statische Assets vollständig vorab cachen → offline lauffähig.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        // Fehler-Tracking wird nur online und nur bei gesetztem DSN geladen: nicht vorab cachen.
        globIgnores: ['**/sentry-*.js'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // YouTube/externe Audio-Streams: nur online, niemals als App-Shell behandeln.
            urlPattern: /^https:\/\/(www\.youtube\.com|i\.ytimg\.com|archive\.org)\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Schwergewichtige Bibliotheken in eigene Chunks (besseres Caching).
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          supabase: ['@supabase/supabase-js'],
          db: ['dexie'],
          // Der Wrapper muss mit in den Chunk, sonst landet er im Haupt-Bundle und zieht
          // Sentry statisch nach (modulepreload für alle, auch ohne Fehler-Tracking).
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
