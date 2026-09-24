-- Account settings (story 3.4): the learner's IANA time zone decides where "today" ends for
-- streaks, daily goals and reminders on the server. Null until the learner or the app sets it.
-- Sessions are listed per user and by activity; the index serves "my devices".

alter table users add column if not exists time_zone text
  check (time_zone is null or length(time_zone) between 1 and 64);

create index if not exists sessions_user_activity_idx on sessions (user_id, updated_at desc);
