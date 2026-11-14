-- Push reminder before a live lesson (ADR-0026, stage 3): the worker announces a planned
-- session once, shortly before it starts, to the members it is for.
--
-- * live_sessions.reminded_at is the claim: set before anything is sent, so a session is
--   announced at most once, also with two workers or a retried job.
-- * notification_prefs.live_reminder lets a learner switch these reminders off; on by default
--   for everyone who has a device registered for push.
-- * Both are additions with a default, so the previous release keeps working on this schema.

alter table live_sessions
  add column if not exists reminded_at timestamptz;

alter table notification_prefs
  add column if not exists live_reminder boolean not null default true;

-- The worker looks every few minutes for planned sessions about to start.
create index if not exists live_sessions_reminder_idx
  on live_sessions (starts_at) where status = 'scheduled' and reminded_at is null;
