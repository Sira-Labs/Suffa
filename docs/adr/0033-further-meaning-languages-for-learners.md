# ADR-0033: Learners choose a further meaning language once it has words

- Status: accepted (nightly run, ADR-0030)
- Date: 2026-11-24
- Amends: ADR-0021 (the meaning language is `de` or `en`), ADR-0032 (decision 6: learners
  cannot choose the further languages yet)

## Context

Approved meanings in Turkish, Italian, Bosnian and Albanian reach the app with the content
bundle (ADR-0032), and `meaningOf` finds them. The meaning-language setting still offered
German and English only, and typed translations were graded with German or English rules.

Two things stood in the way of simply adding four options:

- **There may be nothing to show.** No meaning is reviewed yet, and the languages will fill
  one by one. A learner who picks Albanian and gets German with a "not yet translated" badge
  on every word has been offered something that is not there.
- **Coverage is partial by design.** Only words have meanings in these languages; dialogue
  lines and grammar examples follow later (ADR-0031, decision 5).

## Decision

1. **The setting takes six values**: `de`, `en`, `tr`, `it`, `bs`, `sq` (sync schema and the
   check on `settings."meaningLanguage"`, migrations 0054 and 0055). Null still follows the
   interface language, which stays German or English.
2. **A further language is offered once it has content on the device**: at least one word
   of the Bayna Yadayk units with a meaning in it (the Medina lessons have no meanings in
   other languages, as for English). This comes from the content the app has (built-in
   units and the downloaded bundle), not from a flag: the day a first unit's meanings are
   published and downloaded, the language appears in the settings. A language the learner
   chose on another device stays in the list even before its content is here.
3. **The settings say what the learner gets**: with a further language chosen, a line says
   that only word meanings are reviewed so far and dialogues and examples stay German.
   Everything without a meaning in the language shows German with the existing badge.
4. **Typed answers are graded with rules per language**, in the same table as German and
   English. Letters with a mark fold to their base letter (ş, ç, ğ, ö, ü, č, ć, š, ž, ë, à),
   so an answer typed on another keyboard is right; the German digraphs ae, oe, ue apply to
   German and English only. On top of that:
   - Turkish: dotless `ı` counts as `i`; a leading `bir` is ignored.
   - Italian: leading articles are ignored, also elided ones (`l'amico`).
   - Bosnian: `đ` counts as `dj` or `d`; no articles.
   - Albanian: a leading `një` is ignored. The linking articles (`i`, `e`, `të`, `së`) are
     not: "e hënë" is Monday and "hënë" the moon. A gloss that allows an adjective without
     its article writes it "(i) mirë".

   German articles are not ignored in these languages. The tolerance is the one German has:
   words that differ only in a mark ("koy"/"köy", "papa"/"papà") or in a leading article
   ("una volta"/"volta") count as the same answer, as "schon"/"schön" do today.

5. **Multiple choice stays in one language per question** as for English: if one option has
   no meaning in the language, all options of that question are German.
6. **A learner's own words** are graded with the German rules when a further language is
   chosen: they keep the meaning the learner typed, mostly German, and Turkish or Albanian
   rules would count "das Haus" for "Haus" as wrong.

## Alternatives

- Offering all four at once: see the context.
- A server-side switch per language: one more thing an admin has to remember, and it can
  disagree with what the device actually has offline.
- Offering a language only when every word has a meaning: units are reviewed one by one,
  and a learner in unit 2 should not wait for unit 16.
- A minimum share of translated words: any threshold is arbitrary; the badge already tells
  the learner where the German stands in.

## Consequences

- With nothing approved yet, the settings look exactly as before.
- The grading rules were written without a teacher of these languages; a teacher's review of the meanings (sprint plan, "Waiting on
  the owner") should include a look at them.
- An older app that syncs a `tr` choice treats it as "follow the interface" and sends it
  back unchanged. An API of the release before this one rejects a settings record with a new
  value, so after a rollback the settings of a learner who chose one do not sync until this
  release runs again; nothing is lost on the device.
- The multiple-choice aid in reviews takes its options from cards in the same language as
  the answer. While only part of a learner's words have a meaning in the chosen language it
  can have fewer than three other options, as it can for English.
- Choosing "like the interface" again on one device does not reach the others: the sync
  keeps a stored choice when a record comes without one (so that older apps do not reset
  it). That was so for English already.
- Medina lesson meanings, nisba, verb and minimal-pair meanings and the server side (tutor,
  live quiz) stay German, as they do for English.
