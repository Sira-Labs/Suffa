# ADR-0021: Learner languages — UI, tutoring and meaning language (German, English, later Arabic UI)

- Status: accepted (tutoring language implemented in Sprint 10; UI language implemented in story 16.3, see `docs/i18n.md`; meaning language in story 16.4: learner side implemented, CMS translations in progress)
- Date: 2026-09-23
- Related: ADR-0011 (al-Muʿallim), ADR-0014 (content CMS)

## Context

Suffa is German-only today: UI strings are hard-coded in German, vocabulary glosses exist only
in German (`de` field), and translation answers are graded against German. Learners and
teachers outside the German-speaking world need English, and the AI tutor should explain in the
learner's language. Arabic stays the target language in every case.

## Decision

Three separate, per-user settings (synced; a teacher can set a class default):

| Setting               | Values                                  | Drives                                                                                 |
| --------------------- | --------------------------------------- | -------------------------------------------------------------------------------------- |
| **UI language**       | `de`, `en` (later `ar` with RTL chrome) | All interface text                                                                     |
| **Tutoring language** | `de`, `en` (default: UI language)       | Language al-Muʿallim explains and corrects in; weekly recap, feedback texts            |
| **Meaning language**  | `de`, `en` (default: UI language)       | Which glosses are shown and which language translation answers are typed and graded in |

- **UI strings** move into typed message catalogues (`i18next` + `react-i18next`, one lazily
  loaded namespace per module; plural rules via `Intl.PluralRules`). A lint rule flags new
  hard-coded UI strings.
- **Content**: glosses become per language: `bedeutung: { de: "Land, Ort", en: "country, place" }`.
  The `de` field stays readable during migration. Missing languages fall back to German with
  a visible "not yet translated" badge.
- **Grading**: `gradeTranslation()` (tolerant matcher, shipped 2026-09-23) is already
  language-agnostic: it splits alternatives, expands optional parts, forgives typos and
  ignores German and English leading articles (`der/die/das/ein…`, `the/a/an/to`).
  Per-locale normalisation rules (e.g. umlaut folding for German, British/American spellings
  for English) live in one table per locale.
- **English content** is drafted in bulk by an LLM (Batch API, ADR-0010) from the German
  glosses and the Arabic, then **reviewed by a teacher/admin in the CMS** before it is
  published; nothing machine-translated reaches learners unreviewed.
- **Tutoring**: the tutor prompt takes `explanationLanguage` as a parameter; the eval sets
  (ADR-0011) get an English copy so both languages are measured.

## Alternatives

- Single language setting: simpler, but a German speaker who wants English explanations (or
  an English teacher with German-speaking students) cannot be served.
- Machine-translating glosses at runtime: no review, inconsistent meanings, offline breaks.

## Consequences

String extraction touches every module once (planned in Sprint 16). Tutoring language is cheap
and ships with the tutor (Sprint 10). Content grows by one field per language; the CMS review
queue gets a "translations" view.

## Implementation notes (story 16.3, first part)

- `i18next` 25 + `react-i18next` 15. German catalogues are bundled and initialised
  synchronously (tests and the first render need no async step); English is a separate chunk
  loaded when chosen. Catalogue keys are typed (`CustomTypeOptions`), and the English
  catalogues are typed against the German ones.
- Deviation: namespaces are split per area, but only the language is lazy, not each
  namespace: the PWA precaches every chunk anyway, and per-namespace loading would add a
  Suspense boundary to every screen for no offline gain.
- Instead of `eslint-plugin-i18next` a small local rule (`apps/web/eslint/no-hardcoded-ui-text.js`)
  checks the translated areas; it knows Arabic is not interface text and honours `lang` and
  `translate="no"`.
- The setting syncs as `settings.uiLanguage`; the class default for teachers comes with the
  meaning language (16.4).

## Implementation notes (story 16.3, completion)

- Every module is translated, one namespace per area; the lint rule covers
  `apps/web/src/*.tsx`, `components/**` and `modules/**`.
- Course data shared with the server (quest titles, badge texts, stage names) stays German in
  `@suffa/engagement`; screens look it up by id, and a test fails if the German catalogue
  drifts from the data. Titles that differ per course use `<id>@<course>` keys.
- API errors: `apiRequest` takes an area and resolves `errors:<area>.<code>` in the current
  language when the error is created; keys are the API's error codes.
- German course content (meanings, unit titles, lesson topics) is marked `lang="de"`, so screen
  readers pronounce it as German and the e2e check skips it until meanings follow the meaning
  language (16.4).

## Implementation notes (story 16.4, learner side)

- Setting `settings.meaningLanguage` (migration 0041, synced, kept by the sync when an older
  app does not send it); null follows the interface language. Settings → "Sprache der
  Bedeutungen".
- Content gets optional English next to German instead of a nested `bedeutung` object, so
  existing ids, cards and the `de` field stay untouched: `Vokabel.en`, `DialogZeile.en`,
  grammar `beispiele[].en`. English arrives only through the CMS (reviewed, published, in the
  content bundle); the files in the repository stay German.
- `meaningOf(item, language)` returns the gloss and whether it is a German fallback; screens
  show the fallback with a "not yet translated" badge (`MeaningText`, `NotTranslated`).
  Multiple-choice questions take all options from one language (`consistentMeanings`): German
  for all if any option lacks English, so no option stands out.
- Review cards (`vocab_ar_de`, `vocab_de_ar`, plural and root prompts), exams, reading glosses,
  line translations and the comprehension question, writing prompts and the word of the day
  follow the meaning language. A learner's own words keep what they typed.
- Grading: `gradeTranslation(input, gloss, locale)` has a rule table per locale. German keeps
  its rules (umlaut folding, German and English articles); English ignores `the/a/an/to` and
  folds British and American spellings (colour/color, centre/center, -ise/-ize, travelling,
  grey).
- Not yet: Medina lesson meanings are static files without English (badge shown), nisba,
  verb and minimal-pair meanings, examples and the server side (tutor curriculum pack, live
  quiz options) stay German.
