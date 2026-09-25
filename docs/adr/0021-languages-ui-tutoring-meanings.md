# ADR-0021: Learner languages — UI, tutoring and meaning language (German, English, later Arabic UI)

- Status: accepted (tutoring language implemented in Sprint 10; UI and meaning languages planned for Sprint 16)
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
