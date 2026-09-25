-- AI gateway (Sprint 9, ADR-0010): routing table, budget settings and metering.

-- Task → ordered models. position 0 is the primary route, higher positions are fallbacks.
-- Editable in the admin area; the router reloads it at most 60 s later.
create table if not exists ai_model_routes (
  task         text not null check (task ~ '^[a-z]+(\.[a-z-]+)+$'),
  position     smallint not null check (position between 0 and 9),
  provider     text not null check (provider in ('anthropic', 'openrouter', 'huggingface')),
  model        text not null check (length(model) between 1 and 200),
  effort       text check (effort in ('low', 'medium', 'high', 'xhigh', 'max')),
  max_tokens   integer not null check (max_tokens between 1 and 128000),
  capabilities text[] not null default '{}'
    check (capabilities <@ array['tools', 'structuredOutput', 'vision', 'streaming']),
  premium      boolean not null default false,
  enabled      boolean not null default true,
  -- USD per million tokens; null = built-in Anthropic price list.
  price_input  numeric(10, 4) check (price_input >= 0),
  price_output numeric(10, 4) check (price_output >= 0),
  updated_by   uuid references users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (task, position)
);

-- Defaults from 02-technical-spec.md §6.1. Premium routes are skipped once 80 % of the monthly
-- budget is spent. The open-model prices are upper estimates: check them on openrouter.ai.
insert into ai_model_routes
  (task, position, provider, model, effort, max_tokens, capabilities, premium, price_input, price_output)
values
  ('tutor.converse', 0, 'anthropic', 'claude-sonnet-5', 'low', 1024,
   array['tools', 'structuredOutput', 'vision', 'streaming'], true, null, null),
  ('tutor.converse', 1, 'anthropic', 'claude-haiku-4-5', null, 1024,
   array['tools', 'structuredOutput', 'vision', 'streaming'], false, null, null),
  ('tutor.converse', 2, 'openrouter', 'meta-llama/llama-3.3-70b-instruct', null, 1024,
   array['streaming'], false, 0.6, 0.8),
  ('tutor.explain', 0, 'anthropic', 'claude-sonnet-5', 'medium', 1500,
   array['tools', 'structuredOutput', 'vision', 'streaming'], true, null, null),
  ('tutor.explain', 1, 'anthropic', 'claude-haiku-4-5', null, 1500,
   array['tools', 'structuredOutput', 'vision', 'streaming'], false, null, null),
  ('tutor.explain', 2, 'openrouter', 'meta-llama/llama-3.3-70b-instruct', null, 1500,
   array['streaming'], false, 0.6, 0.8),
  ('grade.writing', 0, 'anthropic', 'claude-sonnet-5', 'medium', 1500,
   array['tools', 'structuredOutput', 'vision', 'streaming'], true, null, null),
  ('grade.writing', 1, 'anthropic', 'claude-haiku-4-5', null, 1500,
   array['tools', 'structuredOutput', 'vision', 'streaming'], false, null, null),
  ('grade.speech', 0, 'anthropic', 'claude-sonnet-5', 'medium', 1500,
   array['tools', 'structuredOutput', 'vision', 'streaming'], true, null, null),
  ('grade.speech', 1, 'anthropic', 'claude-haiku-4-5', null, 1500,
   array['tools', 'structuredOutput', 'vision', 'streaming'], false, null, null),
  ('exercise.generate', 0, 'anthropic', 'claude-haiku-4-5', null, 4000,
   array['tools', 'structuredOutput', 'vision', 'streaming'], false, null, null),
  ('exercise.generate', 1, 'openrouter', 'meta-llama/llama-3.3-70b-instruct', null, 4000,
   array['streaming'], false, 0.6, 0.8),
  ('tutor.coach', 0, 'anthropic', 'claude-haiku-4-5', null, 800,
   array['tools', 'structuredOutput', 'vision', 'streaming'], false, null, null),
  ('content.author-assist', 0, 'anthropic', 'claude-opus-5', 'high', 8000,
   array['tools', 'structuredOutput', 'vision', 'streaming'], true, null, null),
  ('content.author-assist', 1, 'anthropic', 'claude-sonnet-5', 'medium', 8000,
   array['tools', 'structuredOutput', 'vision', 'streaming'], true, null, null)
on conflict (task, position) do nothing;

-- One row: the monthly budget and the daily turn quotas per platform role (null = no limit).
create table if not exists ai_settings (
  id                     boolean primary key default true check (id),
  monthly_budget_micro   bigint not null default 100000000 check (monthly_budget_micro >= 0),
  downgrade_percent      smallint not null default 80 check (downgrade_percent between 1 and 100),
  student_daily_turns    integer default 30 check (student_daily_turns >= 0),
  teacher_daily_turns    integer default 100 check (teacher_daily_turns >= 0),
  admin_daily_turns      integer check (admin_daily_turns >= 0),
  updated_by             uuid references users (id) on delete set null,
  updated_at             timestamptz not null default now()
);
insert into ai_settings (id) values (true) on conflict (id) do nothing;

-- Every call: who, which task, which model served it, tokens, cost and latency.
create table if not exists ai_calls (
  id                 bigserial primary key,
  user_id            uuid references users (id) on delete set null,
  task               text not null,
  provider           text,
  model              text,
  outcome            text not null,
  input_tokens       integer not null default 0,
  output_tokens      integer not null default 0,
  cache_read_tokens  integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_micro         bigint not null default 0,
  latency_ms         integer not null default 0,
  attempts           jsonb not null default '[]'::jsonb,
  created_at         timestamptz not null default now()
);
create index if not exists ai_calls_created_idx on ai_calls (created_at desc);
create index if not exists ai_calls_user_idx on ai_calls (user_id, created_at desc);

-- Counters checked before every call (cheap, exact): turns per user and day, spend per month.
create table if not exists ai_usage_daily (
  user_id    uuid not null references users (id) on delete cascade,
  day        date not null,
  turns      integer not null default 0,
  tokens     bigint not null default 0,
  cost_micro bigint not null default 0,
  primary key (user_id, day)
);

create table if not exists ai_spend_monthly (
  month      date primary key check (extract(day from month) = 1),
  cost_micro bigint not null default 0
);
