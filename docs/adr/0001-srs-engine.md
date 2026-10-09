# ADR-0001: SM-2-style SRS engine with 4-level grading

- Status: accepted
- Date: 2026-06-13

## Context

Spaced repetition is the core of the app. We need scheduling that computes offline and
deterministically, is well understood and is testable.

## Decision

We implement an SM-2 variant (`src/services/srs/engine.ts`):

- **4-level grading** (`again`/`hard`/`good`/`easy`) instead of the classic 0–5 scale — closer
  to Anki/FSRS and matching the UI buttons.
- **Learning phase with fixed intervals**: first successful review 1 day, second 6 days, then
  `interval × ease`.
- **Ease** starts at 2.5, minimum 1.3; adjusted per grade.
- **`again` is a lapse**: reps reset, ease penalty, due again; from `LEECH_LAPSE_THRESHOLD`
  lapses on, the card is marked as a **leech** (automatic error log → "Schwierige Wörter"
  (difficult words)).
- Pure functions (no I/O) → fully unit-testable (`srs.test.ts`).

## Alternatives

- **FSRS** (more modern, more accurate): higher complexity, more parameters, harder to reason
  about. SM-2 is sufficient for Book 1; switching later is possible locally behind the
  `schedule()` interface.

## Consequences

Predictable, explainable behaviour; per-button interval preview is possible. Slightly less
optimal than FSRS for very large decks — irrelevant at the size of a textbook course.

## Amendment (2026-10, story 15.6): FSRS-5 as a per-learner option

FSRS-5 (`src/services/srs/fsrs.ts`, default weights, desired retention 90 %) now sits behind the
same `schedule()` (`algorithm: 'fsrs'`); SM-2 stays the default. Learners switch in
"Einstellungen → Wiederholungsplan" for the pilot.

- **State:** each card carries an FSRS stability and difficulty next to the SM-2 fields; both are
  synced (migration 0037). Older app versions that do not send them keep the stored values.
- **Converting SM-2 history:** a card's first FSRS review starts from its SM-2 state (stability =
  interval, difficulty from the ease, linearly: ease 2.5 ↔ 5, 1.3 ↔ 9). Switching never moves a
  due date, so the same cards are due on the day of the switch.
- **Switching back loses nothing:** FSRS keeps interval, reps, lapses and an ease derived from the
  difficulty up to date, so SM-2 continues from them; the FSRS state stays on the card.
- **Sync:** cards rebuilt from review logs replay with the learner's algorithm, deterministically,
  so devices converge.
- Lapses and leeches work as before. Whether FSRS stays optional or becomes the default is decided
  with the pilot data (review load, retention in later reviews).
