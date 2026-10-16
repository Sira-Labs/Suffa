# ADR-0027: Class settings — colour schemes and practice areas

- Status: accepted (owner, 16 Oct 2026)
- Date: 2026-10-16

## Context

The first teacher asked for a fresher look than the dark green, and for roots to open only once
learners know some words. Teachers differ: one colour for every teacher would not fit, a colour
per teacher would split a learner's app between classes. Areas opening "from unit 3" must hold
offline, like the rest of the app (ADR-0006).

## Decision

- **The class carries the settings** (`classes.palette`, `classes.unlocks`, migration 0047),
  set by its teachers on a "Settings" tab (`PUT /classes/:id/settings`, class:manage,
  audit-logged). The ids and rules live in `@suffa/engagement`, so the API and the app check
  the same thing.
- **Five colour schemes**, each for the dark and the light theme: _Oase_ (the original look),
  _Meer_, _Minze_, _Lavendel_, _Sand_. They set the same design tokens as `global.css`; Oase is
  the stylesheet itself, the others are inline custom properties on `<html>`. A test checks
  WCAG AA contrast for every token pair, and the axe browser test audits pages in each scheme.
- **Learners follow their class** — the active class they joined last — unless they pick a
  scheme themselves (`settings.palette`, synced; `class` or none follows the class).
- **Practice areas** (alphabet, vocabulary, reading, writing, speaking, roots, conjugation,
  exam) are open now, from a unit of the class's course, or closed until the teacher opens
  them. "From unit N" counts within the course (Medina lesson 3 is unit 103). The default holds
  for learners without a class too: roots from unit 3, everything else open. Teachers and
  admins always see every area.
- **Offline**: the last known class settings are kept in localStorage; the app applies them
  at start and updates them with the class list after each sync.

## Consequences

- A learner in two classes sees the latest one's colours and areas; a teacher changing them
  reaches learners at their next sync.
- The lock is a learning aid, not access control: the content of a locked area ships with the
  app as before.
- The accessibility test no longer audits the roots explorer for a new learner (it is locked
  until unit 3); its markup did not change.
