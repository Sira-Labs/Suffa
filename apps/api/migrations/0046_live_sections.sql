-- Sisters' and brothers' live lessons (ADR-0026, stage 2): the teacher assigns each learner of a
-- class to the sisters or the brothers; a live session is for everyone, the sisters or the
-- brothers, and may keep the learners' cameras off (only their microphone with the floor).
--
-- * A learner without a section sees and joins only sessions for everyone.
-- * Teachers are not assigned: they see and lead every session of their class.

alter table class_members
  add column if not exists section text check (section in ('sisters', 'brothers'));

alter table live_sessions
  add column if not exists audience text not null default 'all'
    check (audience in ('all', 'sisters', 'brothers')),
  add column if not exists learner_cameras boolean not null default true;

-- One live session per audience (not per class), so the sisters and the brothers can meet
-- at the same time.
-- The new index first, so the limit holds throughout (the table is small: no concurrent build).
create unique index if not exists live_sessions_live_audience_idx
  on live_sessions (class_id, audience) where status = 'live';
drop index if exists live_sessions_live_idx;
