# ADR-0016: Engagement system — XP, daily quests, weekly challenges, achievements

- Status: accepted (implemented in Sprint 5)
- Date: 2026-09-24

## Context

A teacher wants to run Suffa with his class and motivate students with **daily and weekly
achievements**. Today the app has a UTC-based day streak (`services/stats.ts#computeStreak`),
a daily goal setting and a heat-map — no XP, quests, badges or class-level goals. The app is
offline-first, so rewards must appear instantly offline, but leaderboards and teacher views
must not be trivially cheatable.

## Decision

- New pure package **`packages/engagement`** (same pattern as `packages/srs`): rules as data +
  pure functions `xpFor(event)`, `dailyQuests(user, date, state)`, `evaluateQuests(events)`,
  `evaluateAchievements(history)`, `weeklyChallengeProgress(classEvents)`.
- **Event-sourced from data we already sync**: `review_logs`, `exam_results`,
  `media_progress` (ADR-0018), tutor turns. No separate "XP table" is trusted from the client.
- **Two evaluators, one codebase:**
  - _Client (provisional)_: runs offline right after an action → instant XP toast, quest tick,
    badge animation.
  - _Server (authoritative)_: worker job recomputes after each sync push with plausibility
    checks (min answer time, max reviews/min, duplicate detection) and writes
    `xp_ledger`, `quest_progress`, `achievement_unlocks`. Leaderboards and teacher dashboards
    only read server data. Client reconciles to server values silently.
- **Day boundary in the learner's time zone** (`settings.timezone`, default from the device),
  not UTC — fixes the current streak behaviour for learners outside UTC.
- **Streak protection:** earnable "streak shields" (1 per 7-day streak, max 2), optional
  **weekly streak** mode (goal = N active days per week) for learners who can't study daily.
- **Teacher layer:** class weekly challenge (cooperative target), custom badges awarded by the
  teacher, shout-outs, weekly recap. Details in `docs/plan/engagement-plan.md`.
- **Ethics guardrails (hard rules):** no loot boxes or chance-based rewards (also avoids
  _maysir_), nothing purchasable, no shaming copy, leaderboards opt-in and off by default for
  classes flagged `minors`, rest days allowed, max 1 reminder/day.
- **Learning guardrail metric:** growth of _mature_ SRS cards; if engagement rises while it
  falls, XP weights are wrong (XP rewards effortful recall, correctness and spacing — not raw
  volume; per-day XP from reviews is soft-capped).

## Alternatives

- Server-only evaluation: tamper-proof but no instant feedback offline.
- Client-only: instant but trivially cheatable; unusable for class leaderboards.
- Third-party gamification SaaS: data leaves our servers, poor offline support.

## Consequences

Rules live in one tested package used by web and worker. New tables: `xp_ledger`,
`quest_progress`, `achievement_defs`, `achievement_unlocks`, `class_challenges`,
`teacher_badges`, `push_subscriptions`. Changing XP weights is a versioned rules change
(`rulesVersion`) with a recompute job.

## Implementation (Sprint 5)

- **One rulebook:** `packages/engagement` is pure TypeScript without dependencies. The app
  imports it from source (Vite alias); the api compiles it first (`prebuild`) and its image
  ships the package's `dist`. Inputs are structural (`ReviewEntry`, `ExamEntry`, …), so the
  app's records and the server's rows fit without mapping.
- **Days** are computed with `Intl` in the account's time zone (`users.time_zone`; the app
  sets it from the device at sign-in when empty). A day counts for the streak when at least
  one daily quest was done.
- **Quests** depend on the day only (FNV hash of the date per slot), so all devices and the
  server agree, also offline. Every quest is doable without a microphone.
- **Badges** are measured on facts that only grow (cards that became mature, perfect
  tests, lessons heard, streak lengths reached), so recomputing never takes one away; the
  server additionally never deletes `achievement_unlocks` rows.
- **Server recompute:** each push that applied records queues a debounced (20 s) job per
  learner on the `engagement` queue. The worker drops implausible records (answers under
  500 ms, more than 30 reviews or practice items in any minute, the same card twice within
  2 s, timestamps in the future, impossible scores) and replaces the learner's `xp_ledger`.
  `GET /api/v1/engagement` serves the result; the app shows the server's totals once all its
  data is uploaded and the server computed after the newest local event, and always shows
  the badges the server knows.
- `RULES_VERSION` is stored with every ledger row; changing a weight bumps it.

## Implementation (Sprint 6)

- **Teacher layer:** `GET /classes/:id/progress` returns aggregates of active learners only
  (no raw records); content ids are resolved to words and units by the teacher's app. The
  class feed (`class:read`, any active member) carries the weekly challenge, shout-outs and
  teacher badges. A challenge is one cooperative target per week in the teacher's time
  zone; progress is counted live from synced data, and reaching it gives every helper the
  "Rūḥ al-Faṣl" badge (server-side unlock, shown in the app through reconciliation).
- **Notifications:** a `Notifier` interface with Web Push (VAPID keys from the environment,
  off without them). The worker checks every 15 minutes; `notification_log (user, kind,
day)` is claimed before sending, so a learner gets at most one reminder a day even with
  retries. Reminders respect quiet hours and are skipped when a quest is already done that
  day. Weekly recaps are generated on Sunday from 18:00 local time and announced once.
