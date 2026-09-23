# Suffa — Design system

- Date: 2026-09-23 · Status: in progress (steps 1–2 of 5 shipped) · Mockups: the "Suffa Redesign"
  canvas (7 screens) · Code: `apps/web/src/styles/global.css`, `components/Icon.tsx`,
  `navigation.ts`

## Principles

1. **Arabic first.** Arabic text is the largest thing on the screen, in Amiri with full
   tashkīl; Latin text supports it.
2. **One thing at a time.** Learning screens (review, listening) hide navigation and show one
   task; overview screens show one clear next step ("Weiterlernen").
3. **Calm and warm.** A deep green-black ground, warm paper cards for Arabic highlights,
   saffron for the one primary action, teal for success. No gradients, no emoji icons.
4. **Offline and fast.** Fonts and icons ship with the app; heavy parts load on demand.
5. **Accessible by default.** Touch targets ≥ 44 px, visible focus, text contrast ≥ 4.5:1 in
   both themes, reduced motion respected.

## Tokens

| Token                                    | Dark (default)               | Light ("paper")       | Use                                     |
| ---------------------------------------- | ---------------------------- | --------------------- | --------------------------------------- |
| `--bg`                                   | `#0f1714`                    | `#f6f1e7`             | page                                    |
| `--bg-elev` / `--bg-elev-2`              | `#17221e` / `#22302b`        | `#fffdf8` / `#ede5d5` | cards / raised controls                 |
| `--text` / `--text-muted`                | `#f4eee2` / `#a9b5ae`        | `#1b2420` / `#56615b` | text                                    |
| `--border`                               | `#2e3d37`                    | `#dcd2bf`             | hairlines                               |
| `--accent`                               | `#e8a93b`                    | `#8a5a12`             | links, highlights (text-safe per theme) |
| `--accent-fill` / `--on-accent`          | `#e8a93b` / `#1a1206`        | same                  | primary buttons                         |
| `--accent-2`                             | `#3fb5a3`                    | `#1f7a6d`             | progress, done states                   |
| `--good` / `--bad` / `--warn` / `--info` | teal / coral / saffron / sky | darker variants       | feedback                                |
| `--paper` / `--on-paper`                 | `#f4eee2` / `#1b2420`        | same                  | "paper" cards with Arabic content       |

Radii 12 / 16 / 24 px; tap target `--tap` 44 px.

## Typography

| Role           | Font                 | Where                                       |
| -------------- | -------------------- | ------------------------------------------- |
| UI text        | Manrope (variable)   | everything Latin                            |
| Headings       | Fraunces (variable)  | `h1`, brand                                 |
| Arabic text    | Amiri 400/700        | `.arabic`, `.arabic-inline`, `.arabic-hero` |
| Arabic display | Reem Kufi (variable) | `.arabic-display`, unit titles, roots       |

All fonts are bundled via `@fontsource` (SIL OFL). Only Latin, Latin-ext and Arabic subsets are
precached for offline use (≈ 370 kB); other scripts load on demand.

## Layout and navigation

- **Phone:** floating bottom bar with five destinations — Heute, Lernen, Hören, Wurzeln, Mehr.
  "Mehr" lists the rest (Lesen, Schreiben, Sprechen, Konjugation, Prüfung, Einstellungen).
- **Desktop (≥ 960 px):** sidebar with every destination, brand on top, sync status at the
  bottom.
- One navigation definition (`navigation.ts`) drives both layouts.

## Components (CSS classes)

`card`, `paper`, `eyebrow`, `btn`, `btn-primary`/`btn-accent`, `btn-lg`, `input`, `badge`,
`row`, `stack`, `grid`, `arabic`, `arabic-lg`, `arabic-hero`, `arabic-display`,
`arabic-inline`, `more-tile`. Icons: `<Icon name="…" />` (stroke SVG, `currentColor`).

## Rollout

| Step | Scope                                                         | Status |
| ---- | ------------------------------------------------------------- | ------ |
| 1    | Tokens, fonts, icons, app shell and navigation, "Mehr" page   | ✅     |
| 2    | "Heute" (today's path, word of the day) and review focus mode | ✅     |
| 3    | Unit as a learning path                                       | ☐      |
| 4    | Listen & read along (player with transcript)                  | ☐      |
| 5    | Root family and pattern trainer                               | ☐      |

Each step ships on its own, tested, so learners never see a half-migrated app.
