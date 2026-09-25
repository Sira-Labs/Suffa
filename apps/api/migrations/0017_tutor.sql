-- al-Muʿallim conversations (Sprint 10, ADR-0011, ADR-0021).

-- Language the tutor explains and corrects in (ADR-0021); Arabic stays the target language.
alter table users add column if not exists tutor_language text not null default 'de'
  check (tutor_language in ('de', 'en'));

create table if not exists ai_conversations (
  id         uuid primary key,
  user_id    uuid not null references users (id) on delete cascade,
  title      text not null default '',
  -- Where the learner asked from, e.g. {"unit": 3} or {"mediaId": "…", "atSec": 754}.
  context    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_conversations_user_idx on ai_conversations (user_id, updated_at desc);
-- Retention (90 days) deletes by age.
create index if not exists ai_conversations_updated_idx on ai_conversations (updated_at);

-- Only what the learner saw is kept: their message and the final answer (no tool traces).
create table if not exists ai_messages (
  id              uuid primary key,
  conversation_id uuid not null references ai_conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  model           text,
  -- Validator findings of the shown answer (after the repair retry), for review and evals.
  flags           text[] not null default '{}',
  rating          smallint check (rating in (-1, 1)),
  created_at      timestamptz not null default now()
);
create index if not exists ai_messages_conversation_idx on ai_messages (conversation_id, created_at);
