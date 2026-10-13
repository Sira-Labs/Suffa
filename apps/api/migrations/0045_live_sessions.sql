-- Live lessons (ADR-0026): a teacher plans live sessions in a class, starts and ends them; the
-- room itself lives on the LiveKit server and nothing of it is stored here.
--
-- * At most one session of a class is live at a time (partial unique index).
-- * A session left live is over 60 minutes after its planned length (ended lazily by the API).

create table if not exists live_sessions (
  id               uuid primary key,
  class_id         uuid not null references classes (id) on delete cascade,
  title            text not null check (length(title) between 1 and 120),
  starts_at        timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 10 and 240),
  status           text not null default 'scheduled'
                   check (status in ('scheduled', 'live', 'ended')),
  started_at       timestamptz,
  ended_at         timestamptz,
  created_by       uuid references users (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists live_sessions_class_idx on live_sessions (class_id, starts_at);
create unique index if not exists live_sessions_live_idx
  on live_sessions (class_id) where status = 'live';
