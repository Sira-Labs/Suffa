# Accessibility audit (WCAG 2.2 AA)

Story 16.5, 2026-10-10. Target: WCAG 2.2 level AA for the web app (the native apps wrap the
same app).

## How it is checked

- **Automated, on every CI run:** `apps/e2e/tests/a11y.spec.ts` runs axe-core 4.13
  (`@axe-core/playwright`, tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`)
  against the production build with the real API, and fails on any serious or critical
  finding. It covers:
  - every learner page without an account, in the dark and the light theme: sign-in, Heute,
    the unit overview, a unit's pace picker and path, reading, writing and listening
    stations, review, vocabulary, test, alphabet course and lesson, roots, conjugation,
    speaking, videos, Discover, library, progress, badges, More, settings, sources, tutor;
  - the Medina course: Heute, units, a lesson page, the lesson tests;
  - a signed-in teacher: Heute, classes, a class with every tab (progress, assignments,
    class life, recordings, members), settings, content review; and the learner of that
    class.
- **Keyboard, automated:** the first Tab reaches "Zum Inhalt springen", which moves the
  focus into `main`; the next 25 Tab stops all show a visible focus indicator.
- **Reflow, automated:** at 320 CSS px (400 % zoom) the main pages have no horizontal
  scrolling (WCAG 1.4.10).
- **Manual review:** keyboard flows, the accessibility tree (landmarks, headings, names,
  live regions, languages) and the WCAG 2.2 additions, see below.

## Findings and fixes

| Finding (axe rule / criterion)                                                                                                  | Where                             | Fix                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------- |
| `color-contrast` (1.4.3, serious): locked unit tiles and locked stages were faded with `opacity`, their labels fell below 4.5:1 | Units overview, both themes       | Locked tiles and stages use a dashed border and the muted text colour instead of opacity. |
| `color-contrast` (1.4.3, serious): upcoming stations of a unit path were faded with `opacity`                                   | Unit path, light theme            | Their title uses the muted text colour; no opacity.                                       |
| `color-contrast` (1.4.3, serious): the eyebrow label on a "paper" card used the dark theme's muted colour                       | Roots, dark theme                 | `.paper .eyebrow` uses the paper's muted colour.                                          |
| No way to bypass the navigation (2.4.1)                                                                                         | Every page                        | "Zum Inhalt springen" / "Skip to content" as the first Tab stop.                          |
| `page-has-heading-one` (moderate)                                                                                               | Review in focus mode, conjugation | The focus session's title is the page's `h1`; conjugation keeps its `h1` without verbs.   |
| Focus not obscured (2.4.11, new in 2.2): on phones the floating bottom bar could cover a focused control near the bottom        | Every page on phones              | `scroll-padding-bottom` keeps room above the bar when the focus scrolls into view.        |
| Focus order (2.4.3): a checkpoint question appears while a recording or video pauses, but the focus stayed on the player        | Recording player, video lessons   | The checkpoint takes the focus when it appears.                                           |
| Faded text: the step counter in writing, wrong answers on the quiz projector (`opacity` 0.8 / 0.35)                             | Writing, live quiz                | No opacity; wrong quiz answers turn grey and are struck through.                          |

After the fixes axe reports no serious or critical finding on the audited pages, and no
moderate one either.

## Manual review

- **Landmarks and headings:** one `nav` (labelled "Hauptnavigation"), one `main`, a
  level-one heading per page; regions on "Heute" are labelled (daily quests, word of the
  day, badges).
- **Names:** icon buttons (listen, close, navigation on phones) have accessible names; form
  fields have labels; the hidden unit titles in the unit tiles are read instead of a mixed
  label.
- **Live regions:** answer feedback, the celebration toast and save messages are
  `role="status"`, so screen readers announce them without moving the focus.
- **Languages (3.1.2):** Arabic carries `lang="ar"` and `dir="rtl"`; German course content
  in the English interface carries `lang="de"` (story 16.3), English meanings `lang="en"`
  (story 16.4).
- **Dialogs:** the feedback dialog and the section celebration move the focus in, keep
  Tab inside, close with Escape and return the focus; the checkpoint now takes the focus
  too.
- **Motion:** `prefers-reduced-motion` turns off transitions and the milestone animation.
- **WCAG 2.2 additions:**
  - 2.4.11 focus not obscured: fixed (see above);
  - 2.5.7 dragging: no task needs dragging (sentence building is tapping words);
  - 2.5.8 target size: checked by axe (`target-size`), no finding;
  - 3.2.6 consistent help: the feedback button sits in the same place on every page;
  - 3.3.7 redundant entry: forms do not ask for the same data twice;
  - 3.3.8 accessible authentication: sign-in by link, six-digit code (paste allowed) or
    passkey; no puzzle, no password to remember.

## Not covered yet

- **A real screen reader.** This pass read the accessibility tree; a session with NVDA
  (Windows) and VoiceOver (iPhone, macOS) by a person is still due before production.
- **The admin area** and the content editor were not part of the axe run (admin with second
  factor); the teacher's content review was.
- **Third-party content:** the YouTube player inside video lessons and the archive.org book
  pages are outside our control. Our own controls around them are covered.
- **Printable certificates** (PDF from the print view) are not tagged PDFs.
- **Live quiz projector view:** checked by the existing quiz browser test, not by axe.
