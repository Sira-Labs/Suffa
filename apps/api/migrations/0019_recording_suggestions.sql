-- AI suggestions for recordings (Sprint 11.4): chapters and checkpoints proposed from the
-- transcript. Nothing reaches learners until the teacher accepts it.

-- Chapters of a recording, shown in the player (jump to a part of the lesson).
create table if not exists media_chapters (
  id         uuid primary key,
  media_id   uuid not null references media_items (id) on delete cascade,
  at_sec     double precision not null check (at_sec >= 0),
  title      text not null check (length(title) between 1 and 120),
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists media_chapters_media_idx on media_chapters (media_id, at_sec);

-- One suggestion run per recording (the latest).
create table if not exists media_suggestion_runs (
  media_id     uuid primary key references media_items (id) on delete cascade,
  status       text not null check (status in ('queued', 'running', 'ready', 'failed')),
  requested_by uuid references users (id) on delete set null,
  error        text,
  updated_at   timestamptz not null default now()
);

create table if not exists media_suggestions (
  id         uuid primary key,
  media_id   uuid not null references media_items (id) on delete cascade,
  kind       text not null check (kind in ('chapter', 'checkpoint')),
  at_sec     double precision not null check (at_sec >= 0),
  -- chapter: {"title"}; checkpoint: the checkpoint data (mcq, dictation, vocab_flash).
  data       jsonb not null,
  status     text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed')),
  decided_by uuid references users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists media_suggestions_media_idx on media_suggestions (media_id, status, at_sec);

-- The model for suggestions: cheap and structured (tech spec §6.1, cost plan §2.4).
insert into ai_model_routes
  (task, position, provider, model, effort, max_tokens, capabilities, premium, price_input, price_output)
values
  ('recording.suggest', 0, 'anthropic', 'claude-haiku-4-5', null, 4000,
   array['tools', 'structuredOutput', 'vision', 'streaming'], false, null, null),
  ('recording.suggest', 1, 'anthropic', 'claude-sonnet-5', 'low', 4000,
   array['tools', 'structuredOutput', 'vision', 'streaming'], true, null, null)
on conflict (task, position) do nothing;
