# ADR-0034: Words for Muslims in Europe are suggested per unit and accepted one by one

- Status: accepted (nightly run, ADR-0030)
- Date: 2026-11-25
- Related: ADR-0014 (content CMS), ADR-0031 (drafts reviewed apart from the units)

## Context

Story 18.4 asks for the Bayna Yadayk word list "curated for Muslims in Europe", from the
teacher's feedback that the word list should fit her learners. The plan says no more than
that, and "LLM draft, review" for the story as a whole. What the units already offer: an
admin can add, change and remove words in a unit's draft, a teacher checks the revision, an
admin publishes.

What is missing is not a way to change the list but the proposals, and a way to judge them
one at a time. Typed straight into a unit's draft, twelve LLM words sit between forty
reviewed ones, and the teacher's one check covers them all.

**Assumed, until the teacher or the owner says otherwise:** "curated" means adding words
from the daily life of Muslims in Europe (mosque and prayer, Ramadan and the feasts, family
and community, food, school and work) to the units whose topic they fit. It does not mean
removing textbook words; an editor can still do that in the unit.

## Decision

1. **Suggestions have a table of their own** (`content_word_suggestions`, migration 0056):
   the word (Arabic, transliteration, German, root, plural), a sentence on why it fits, the
   model, and its state (`suggested`, `accepted`, `rejected`). Nothing that builds a bundle
   or shows a unit reads it.
2. **An admin orders them per unit** (`content:write`). The model gets the unit's title and
   words and the Arabic of every word of the course, and is asked for up to twelve words.
   It runs on the existing task `content.author-assist` (the admin's quality-critical
   authoring route in the technical spec): vocalised Arabic and roots are where a small
   model fails.
3. **Only what has the shape of a word is kept**: the fields of a unit word, Arabic script,
   and not a word the course has or that was suggested for the unit before. Words are
   compared without vowel signs, article and hamza carriers. One suggestion per word and
   unit also after a rejection, so a rejected word does not come back.
4. **A reviewer decides on each one** (`content:review`), and never on one they ordered
   themselves. Accepting takes the word as suggested or with the reviewer's corrections
   and writes it into the unit's draft as its next revision, with an id made from the
   transliteration (`v-iftar`). From there it is an edit like any other: the unit is a
   draft again and reaches learners when it is published.
5. **Accepting is refused** when the course got the word in the meantime
   (`duplicate_word`) or the unit was saved by someone else just then (`unit_changed`).
6. **Every decision is in the audit log**, with the word and whether it was corrected.

## Alternatives

- Adding the words to the unit's draft directly: see the context.
- A course-wide list instead of per unit: words are learnt with a unit's topic and unlock
  with it; a separate list would be a second course.
- A curated list written by the run into the unit files: content nobody reviewed, in the
  place the app is built from.
- A new AI task with its own route: `content.author-assist` exists for exactly this and has
  never been used; one route less to keep priced.

## Consequences

- Nothing changes for learners until a reviewer accepts a word and the unit is published.
- The word and the decision are saved one after the other. If the second fails, the word is
  in the draft and the suggestion still open; accepting it again only records the decision.
- A teacher's accept writes to a unit's draft, which otherwise takes `content:write`. It can
  add one word of the reviewed shape and nothing else.
- Running the task costs money on the admin's premium route; the runs order nothing.
- An accepted word has German only: its English and its meanings in further languages are
  drafted and reviewed like any word's.
- Still to build: the page under "Inhalte prüfen".
