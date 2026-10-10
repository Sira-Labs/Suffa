# ADR-0021: Learner languages — UI, tutoring and meaning language (German, English, later Arabic UI)

- Status: accepted (tutoring language implemented in Sprint 10; UI language in progress in story 16.3, see `docs/i18n.md`; meaning language planned for 16.4)
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
