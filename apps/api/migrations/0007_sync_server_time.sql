-- Pull by server time (fix): devices used to ask for records with updated_at after the newest
-- one they had seen. A device that uploads its existing data later pushes OLD updated_at
-- values, which other devices then never pulled. Now the server stamps every insert and
-- update with its own time (synced_at, milliseconds so browsers keep it exactly) and pulls
-- page by (synced_at, id). Existing rows get the migration time, so every device pulls
-- everything once.

alter table srs_cards
  add column if not exists synced_at timestamptz not null
  default date_trunc('milliseconds', clock_timestamp());
create index if not exists srs_cards_pull_idx on srs_cards (user_id, synced_at, id);

alter table review_logs
  add column if not exists synced_at timestamptz not null
  default date_trunc('milliseconds', clock_timestamp());
create index if not exists review_logs_pull_idx on review_logs (user_id, synced_at, id);

alter table exam_results
  add column if not exists synced_at timestamptz not null
  default date_trunc('milliseconds', clock_timestamp());
create index if not exists exam_results_pull_idx on exam_results (user_id, synced_at, id);

alter table settings
  add column if not exists synced_at timestamptz not null
  default date_trunc('milliseconds', clock_timestamp());
create index if not exists settings_pull_idx on settings (user_id, synced_at, id);

alter table user_vocab
  add column if not exists synced_at timestamptz not null
  default date_trunc('milliseconds', clock_timestamp());
create index if not exists user_vocab_pull_idx on user_vocab (user_id, synced_at, id);

alter table practice_progress
  add column if not exists synced_at timestamptz not null
  default date_trunc('milliseconds', clock_timestamp());
create index if not exists practice_progress_pull_idx on practice_progress (user_id, synced_at, id);

alter table unit_enrollments
  add column if not exists synced_at timestamptz not null
  default date_trunc('milliseconds', clock_timestamp());
create index if not exists unit_enrollments_pull_idx on unit_enrollments (user_id, synced_at, id);

alter table daily_checkins
  add column if not exists synced_at timestamptz not null
  default date_trunc('milliseconds', clock_timestamp());
create index if not exists daily_checkins_pull_idx on daily_checkins (user_id, synced_at, id);

alter table discover_progress
  add column if not exists synced_at timestamptz not null
  default date_trunc('milliseconds', clock_timestamp());
create index if not exists discover_progress_pull_idx on discover_progress (user_id, synced_at, id);

alter table media_progress
  add column if not exists synced_at timestamptz not null
  default date_trunc('milliseconds', clock_timestamp());
create index if not exists media_progress_pull_idx on media_progress (user_id, synced_at, id);
