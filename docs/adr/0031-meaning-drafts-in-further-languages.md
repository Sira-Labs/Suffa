# ADR-0031: Meanings in further languages are drafted and reviewed apart from the units

- Status: accepted (nightly run, ADR-0030)
- Date: 2026-11-21
- Amends: ADR-0021 (how a meaning in a language other than German is drafted, reviewed and
  stored)

## Context

Story 18.4 adds meanings in Turkish, Italian, Bosnian and Albanian, drafted by an LLM and
reviewed by a teacher before anything is published. ADR-0021 did this for English inside the
unit: the draft goes into `content_units.draft`, a teacher checks the revision, and publishing
copies the whole draft into the bundle learners get.

That does not carry over to four more languages:

- **One check approves the whole revision.** A teacher who reads German and Turkish would
  approve Albanian with the same click. The acceptance says every new meaning is reviewed.
- **A draft in the unit blocks or leaks.** Either the publish guard holds back every German
  fix until all four languages are reviewed, or a fix publishes meanings nobody read.
- **`tr` is taken.** A word's flat field `tr` is its transliteration, so Turkish cannot be
  added the way `en` was.
- There is no teacher for these languages yet (sprint plan, "Waiting on the owner"). Drafts
  must be kept somewhere they cannot reach learners however long that takes.

## Decision

1. **A table of their own.** `content_meaning_drafts` holds one row per word, language and
   unit: the text, the German it was drafted from, the model, and its state (`draft`,
   `approved`, `rejected`) with who reviewed it and when. Nothing that builds a content bundle
   reads this table. A learner cannot get a row from it by any route.
2. **Review is per meaning.** A reviewer approves a draft as it is, approves it with their own
   wording, or rejects it. A decision names the text the reviewer saw and counts for that text
   only (`409 draft_changed` when it was drafted again meanwhile). Each decision is written to
   the audit log with the wording it left.
3. **Four eyes.** Whoever ordered a draft cannot decide on it (`403 own_draft`). Drafting needs
   `content:write` (admins with the second factor), reviewing `content:review` (teachers and
   admins), as for English. A second admin can therefore review in a teacher's place, as they
   can check English today; the audit log says who did.
4. **A meaning belongs to the German it was drafted from.** When the word's German changes,
   the row is stale: it cannot be approved (`409 source_changed`) and the next draft run
   replaces it, also when it was approved before. Rejected rows are drafted again; a draft
   waiting for review and an approval of the current German are never overwritten.
5. **Words first.** This step drafts the meanings of words. Dialogue lines and grammar
   examples follow once words have been through a real review.
6. **The same model route as English** (`content.translate`, Mistral in the EU, changed in
   admin → KI), one request per unit and language, at most 120 words each. The prompt asks for
   the terms Muslims who speak the language use themselves.
7. **Nothing is published by this step, and learners cannot pick the languages yet.** The
   meaning-language setting stays German or English until approved meanings exist and a later
   step merges them into published units, under a field that is not `tr`.

## Consequences

- Drafts can be made now and wait for a teacher without any risk to what learners see.
- A German fix to a unit never waits for four reviews, and never publishes an unread meaning.
- Two review paths exist side by side: English per revision (ADR-0021), the new languages per
  meaning. If per-meaning review proves itself, English can move to it.
- The table adds no load to publishing. Rolling back to a release without it leaves the table
  unused; the migration only adds.
- Still to build: the review page in the CMS, merging approved meanings into the units and
  the bundle, the setting and the answer rules for the four languages, and the curated word
  list of 18.4.
