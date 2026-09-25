-- Engagement (Sprint 5, ADR-0016): the weekly goal joins the synced settings, and the server
-- keeps its own, authoritative copy of what the shared rules derive from synced data.

alter table settings add column if not exists "weeklyGoal" integer not null default 5;

-- Every XP award, recomputed from synced records after each push (rules_version says which
-- weights produced it). event_key = kind:ref, unique per learner.
create table if not exists xp_ledger (
  user_id       uuid not null references users (id) on delete cascade,
  event_key     text not null,
  kind          text not null,
  points        integer not null,
  earned_at     timestamptz not null,
  rules_version integer not null,
  primary key (user_id, event_key)
);
create index if not exists xp_ledger_user_earned_idx on xp_ledger (user_id, earned_at);

-- Daily quests per learner and local day.
create table if not exists quest_progress (
  user_id      uuid not null references users (id) on delete cascade,
  day          date not null,
  quest_id     text not null,
  progress     integer not null,
  target       integer not null,
  completed_at timestamptz,
  primary key (user_id, day, quest_id)
);

-- Badge tiers reached; rows are only ever added (badges are never lost).
create table if not exists achievement_unlocks (
  user_id     uuid not null references users (id) on delete cascade,
  badge_id    text not null,
  tier        text not null check (tier in ('bronze', 'silver', 'gold')),
  unlocked_at timestamptz not null,
  primary key (user_id, badge_id, tier)
);

-- The latest recompute per learner: totals for the app and, later, teacher views.
create table if not exists engagement_state (
  user_id        uuid primary key references users (id) on delete cascade,
  total_xp       integer not null,
  level          integer not null,
  streak_current integer not null,
  streak_longest integer not null,
  shields        integer not null,
  rules_version  integer not null,
  rejected       integer not null default 0,
  computed_at    timestamptz not null
);
