-- Interactive recordings and assignments (Sprint 8, ADR-0012/0018).

-- Per-class AI switch: when off, recordings are never sent to a transcription service.
alter table classes add column if not exists ai_enabled boolean not null default true;

-- One transcript per recording: cues {start, end, text} in seconds, editable by the teacher.
create table if not exists media_transcripts (
  media_id   uuid primary key references media_items (id) on delete cascade,
  status     text not null check (status in ('queued', 'processing', 'ready', 'failed')),
  source     text not null check (source in ('whisper', 'manual')),
  cues       jsonb not null default '[]'::jsonb,
  error      text,
  edited_by  uuid references users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Questions that pause the player at a moment of the recording.
create table if not exists media_checkpoints (
  id         uuid primary key,
  media_id   uuid not null references media_items (id) on delete cascade,
  at_sec     double precision not null check (at_sec >= 0),
  kind       text not null check (kind in ('mcq', 'dictation', 'vocab_flash')),
  data       jsonb not null,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists media_checkpoints_media_idx on media_checkpoints (media_id, at_sec);

-- Work the teacher sets with a due date: a unit (its test) or a recording (heard).
create table if not exists class_assignments (
  id         uuid primary key,
  class_id   uuid not null references classes (id) on delete cascade,
  kind       text not null check (kind in ('unit', 'recording')),
  ref        text not null check (length(ref) between 1 and 64),
  title      text not null check (length(title) between 1 and 120),
  due_at     timestamptz not null,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists class_assignments_class_idx on class_assignments (class_id, due_at);
