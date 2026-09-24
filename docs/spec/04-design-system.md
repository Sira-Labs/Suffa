# Suffa — Design system

- Date: 2026-09-23 · Status: in progress (steps 1–3 of 5 shipped) · Mockups: the "Suffa Redesign"
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

- **Phone:** floating bottom bar with five destinations — Heute, Einheit, Entdecken, Training,
  Mehr (redesign v2). "Training" gathers practice across all units (Wiederholen, Vokabeln,
  Wurzeln, Konjugation, Prüfung); "Mehr" lists the rest (Buch-Medien, Lesen, Schreiben, Sprechen,
  Einstellungen). Inside a unit every skill opens as a station of the unit.
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
| 3    | Unit as a learning path                                       | ✅     |
| 4    | Listen & read along (player with transcript)                  | ☐      |
| 5    | Root family and pattern trainer                               | ☐      |

Each step ships on its own, tested, so learners never see a half-migrated app.

### v2: the unit as a room (mockups: third row of the "Suffa Redesign" canvas)

Learners work _inside_ a unit instead of jumping to separate areas: every skill of the unit is
a station of its path and opens at `/units/:unit/:station` with only that unit's content.

| Step | Scope                                                                                                                                                                                    | Status |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1    | Unit room: stations for listening (page video + audio), reading, writing, speaking, verbs; skill rings; first success per item counted (`practice_progress`, +2 XP), station celebration | ✅     |
| 2    | Start a unit with a pace (3/2/1 weeks), countdown, one extension; next unit unlocks with the unit test (≥ 80 %)                                                                          | ✅     |
| 3    | Levels (= books) and stages (units 1–8 + mid-term test, 9–16 + final test), milestone screen                                                                                             | ✅     |
| 4    | "Entdecken": curated media library (Arabic language, Quran, stories, podcasts); navigation Heute · Einheit · Entdecken · Training · Mehr                                                 | ✅     |

**Focused sections (after v2).** A unit's path shows one dialogue at a time. Each own dialogue is
a section: the publisher's k-th dialogue lesson, reading dialogue k, its words (cards and
writing) and speaking its lines (optional). Words belong to the first dialogue they occur in
(stem match), the rest are spread evenly (`dialogueSections`). Done sections fold away and can
be reopened; later sections show only "folgt danach". A closing section ("Abschluss") holds the
publisher's remaining lessons, own words, verbs and the unit test. Station pages and the focus
review take `?section=k` and offer only that section's items.

**Writing inside a unit** is a guided sequence of five steps (Abschreiben, Diktat, Umschrift →
Schrift, Satzbau, Übersetzen), each with its own count. A step works through the open tasks in
order, never repeats a solved one, moves on after a correct answer and continues where the
learner left off when switching steps. Every first correct answer shows "+2 XP" at once; all
five steps count toward the unit (copying keeps the bare word id, so earlier progress stays).

## Feedback moments

- **Celebration toast** (`CelebrationToast`): "+5 XP · Dialog gehört" with a medal and a small
  particle burst in saffron and teal; a bigger burst for milestones (whole lesson). Announced via
  `role="status"`; particles are decorative and disappear under reduced motion.
- **Page videos** (`BookVideos`): a chip per book page ("S. 28"), a poster with a play button;
  the YouTube player (no-cookie domain) loads only on play. In a unit's path the videos are an
  _optional_ station (dashed marker) that never blocks "current" or counts toward progress.
- **Listening progress:** a check badge per heard track, "2/3 gehört" per lesson, a progress bar
  along the bottom of each unit chip, and the whole book's progress on top of the library.
