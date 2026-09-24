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
