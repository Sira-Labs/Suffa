/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// Basis-Pfad: für GitHub Pages liegt die App unter /<repo>/ (z. B. /arabictutor/).
// Override per BASE_PATH (z. B. '/' bei Custom-Domain oder anderem Host).
// Im Dev-Server immer '/' für bequeme lokale Entwicklung.
const BASE_PATH = process.env.BASE_PATH ?? '/arabictutor/';

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? BASE_PATH : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png', 'fonts/*.woff2'],
      manifest: {
        name: 'Al-Arabiyya bayna Yadayk – Lerntrainer',
        short_name: 'Bayna Yadayk',
        description:
          'Offline-first Lerntrainer für MSA-Arabisch nach „العربية بين يديك“ Buch 1.',
        lang: 'de',
        dir: 'ltr',
        theme_color: '#0f766e',
        background_color: '#0b1120',
        display: 'standalone',
        // start_url & scope werden bewusst weggelassen → vite-plugin-pwa leitet
        // sie aus `base` ab, damit die PWA auch unter /arabictutor/ funktioniert.
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
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/services/**/*.ts'],
    },
  },
}));
