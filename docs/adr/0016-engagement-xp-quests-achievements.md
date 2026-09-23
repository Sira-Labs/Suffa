# ADR-0016: Engagement system — XP, daily quests, weekly challenges, achievements

- Status: proposed
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
