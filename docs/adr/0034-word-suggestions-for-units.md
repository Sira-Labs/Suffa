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
   and not a word the course has or that was suggested for the unit before. One suggestion
   per word and unit also after a rejection, so a rejected word does not come back.
4. **Two spellings of one word share a key**: without article, sukun, case ending and
   tatweel, a long vowel with or without its short vowel, hamza on alif folded. The vowels
   inside a word and the shadda count: رَجُل and رِجْل, دَرَسَ and دَرَّسَ are different words. A word
   written without vowel signs is not recognised as its vocalised spelling; that duplicate
   is left to the reviewer, which is better than refusing a word that only looks alike.
5. **A unit with twelve undecided suggestions gets no more** (`decide_first`), before the
   model is asked: a pile nobody decided on does not grow, and a click costs nothing then.
   The limit also holds when two runs answer at the same time: the later one stores only
   what still fits.
6. **A reviewer decides on each one** (`content:review`), and never on one they ordered
   themselves. Accepting takes the word as suggested or with the reviewer's corrections
   (still Arabic, with no letter of another script, in a unit word's shape) and writes it into the unit's draft as its
   next revision. From there it is an edit like any other: the unit is a draft again, a
   check of the revision before no longer counts, and it reaches learners when it is
   published.
7. **The word gets an id nobody had**, made from the transliteration (`v-iftar`, then
   `v-iftar-2`): not one of another unit, and not one this unit had and dropped. Review
   cards and meanings in further languages point at ids.
8. **Accepting is refused** when another unit got the word in the meantime
   (`duplicate_word`) or the unit was saved by someone else just then (`unit_changed`:
   decide again). When the word is in this unit already, the suggestion is settled by it
   and only the decision is recorded.
9. **Every decision is in the audit log**, with the word and whether it was corrected.

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
- The unit's draft and the decision are saved in one transaction on one connection: both or
  neither. What to write is worked out before, from plain reads, and refused if the unit was
  saved or the suggestion decided in between. A request never holds one database connection
  while it waits for another.
- Saving a unit now claims its new ids before it checks them: two units saved with the same
  new id at the same moment no longer both keep it (this was possible before, for any save).
- Two units can get the same word when it is accepted for both at the same moment; one after
  the other, the second is refused.
- Ignoring case endings merges a few forms the course lists apart (أَنْتَ and أَنْتِ, مَساء and
  مَساءً, يَوْم and اليَوْمَ): the second form of such a pair is not suggested.
- A teacher's accept writes to a unit's draft, which otherwise takes `content:write`. It can
  add one word of the reviewed shape and nothing else.
- Running the task costs money on the admin's premium route; the runs order nothing.
- An accepted word has German only: its English and its meanings in further languages are
  drafted and reviewed like any word's.
- Still to build: the page under "Inhalte prüfen".
