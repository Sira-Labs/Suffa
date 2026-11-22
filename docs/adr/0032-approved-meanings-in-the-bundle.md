# ADR-0032: Approved meanings reach learners through the content bundle

- Status: accepted (nightly run, ADR-0030)
- Date: 2026-11-23
- Amends: ADR-0031 (decision 1, "nothing that builds a content bundle reads this table", and
  decision 7, "a later step merges them into published units")

## Context

ADR-0031 keeps meanings in Turkish, Italian, Bosnian and Albanian in a table of their own
and reviews each one by itself. It left open how an approved meaning gets to learners and
expected them to be merged into the published units.

Merging into `content_units` brings back what ADR-0031 took apart:

- A unit has one draft, one check and one publish step for all of it. A meaning written into
  the draft waits for the next German revision and its check, or forces one.
- The unit would then hold a second copy of the meaning. The German can change in the draft
  while the copy stays, and nothing ties the copy to the German it was approved for.
- An editor could type a meaning into the unit and publish it past the per-meaning review.

## Decision

1. **The bundle is where they meet.** When a content bundle is frozen, every published word
   gets the approved meanings of its unit and id. `content_units` is not touched; the CMS
   schema for units still refuses the field, and the bundle builder drops it from a unit file
   that carries one anyway. Only a review puts a meaning in front of learners.
2. **The field is `bedeutungen`**, an object by language (`{ "tr": "…", "sq": "…" }`) on the
   word. The flat `tr` stays the transliteration, `de` and `en` stay where they are. Dialogue
   lines and grammar examples have no such field yet (ADR-0031, decision 5).
3. **A meaning counts for the German it was approved for.** It is included only while the
   published word has exactly that German. Approved for a German change that is not published
   yet, it waits for the unit; when the published German moves on, it is left out and learners
   get German until the new draft is approved.
4. **Approved means fit for learners; the next bundle carries it.** A bundle is frozen when a
   unit is published, when the API starts, and when an admin asks for it under "Inhalte
   prüfen" (`POST /content/meanings/publish`, `content:write`, audited as
   `content.bundle_created` with the admin). Approving does not freeze a bundle by itself: a
   teacher going through a unit would make one bundle of a few hundred kilobytes per word.
5. **Rejecting an approved meaning takes it back at once.** The rejection freezes a bundle
   without it in the same transaction, whoever rejects: a teacher who finds a published
   meaning wrong does not wait for an admin. This also holds for a word that was removed
   since: a tombstone keeps the word as it was last published, but only with the meanings
   that are still approved.
6. **The app knows the field, learners cannot choose the languages yet.** `meaningOf` finds a
   word's gloss in the four languages and falls back to German, flagged as today for English.
   The meaning-language setting stays German or English until translation answers are graded
   in the new languages (the next step of 18.4).

## Alternatives

- Writing approved meanings into the unit's draft: see the context.
- A bundle after every approval: simple, but a bundle per word; and a bundle per review
  session needs a notion of "session" nobody has.
- A timer that freezes a bundle some minutes after the last approval: one more moving part
  for what one click by the admin who ordered the drafts does.
- A separate download for the meanings: a second thing to keep offline and in step with the
  units. The bundle already is the unit of "what learners have".

## Consequences

- An app that does not know `bedeutungen` ignores it: the bundle format stays 1 and the
  release running before this one keeps working.
- An API of the release before this one does not know the table. When it freezes a bundle
  (a rollback, or the old instance during a deploy), that bundle has no further meanings;
  the next start or publish of this release brings them back. Nothing breaks, learners see
  German in between.
- A deploy or a unit being published also publishes what was approved until then. That is
  intended (decision 4); the review page says that approved meanings go out with the next
  content version.
- One row per word and language: when the German is changed in a unit's draft and the
  meaning is drafted again for it, the meaning approved for the German learners still have
  is replaced by the new draft and leaves the next bundle. Learners get German for that word
  until the unit is published and the new meaning approved. Keeping both would need a row
  per German; not worth it before there is a first reviewed language.
- The review page does not show yet which approved meanings learners already have.
- Until a teacher or a second admin approves meanings, bundles are exactly what they were.
