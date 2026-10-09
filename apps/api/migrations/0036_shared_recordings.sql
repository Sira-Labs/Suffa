-- Learners share their own recordings with their class teachers (story 15.4, ADR-0022).
-- * shared_recordings: one row per recording a learner chose to share with one class. Only
--   that class's teachers hear it; the learner withdraws it at any time. The file lives in
--   the uploads bucket; the row holds its key.
-- * class_members.parental_consent_at: in classes of minors, sharing stays off for a learner
--   until the teacher records that the parents agreed.
-- * object_deletions: files whose row is gone. Rows disappear in many ways (withdrawn,
--   account deleted, removed from the class, consent revoked, class deleted); a trigger
--   queues the file and the api/worker delete it from the store.
alter table class_members add column if not exists parental_consent_at timestamptz;

create table if not exists shared_recordings (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  class_id uuid not null references classes (id) on delete cascade,
  object_key text not null unique,
  content_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  text text not null,
  score real check (score between 0 and 1),
  comment text,
  commented_at timestamptz,
  heard_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists shared_recordings_class_idx
  on shared_recordings (class_id, created_at desc);
create index if not exists shared_recordings_user_idx
  on shared_recordings (user_id, created_at desc);

create table if not exists object_deletions (
  bucket text not null,
  object_key text not null,
  queued_at timestamptz not null default now(),
  primary key (bucket, object_key)
);

create or replace function queue_shared_recording_file() returns trigger
language plpgsql as $$
begin
  insert into object_deletions (bucket, object_key)
  values ('uploads', old.object_key)
  on conflict do nothing;
  return old;
end
$$;
create or replace trigger shared_recordings_file_cleanup
  after delete on shared_recordings
  for each row execute function queue_shared_recording_file();

-- Leaving a class (or being removed) ends sharing with it.
create or replace function drop_shared_recordings_of_member() returns trigger
language plpgsql as $$
begin
  delete from shared_recordings
   where user_id = old.user_id and class_id = old.class_id;
  return old;
end
$$;
create or replace trigger class_members_shared_recordings_cleanup
  after delete on class_members
  for each row execute function drop_shared_recordings_of_member();

-- Marking a class as one of minors removes what learners without recorded consent shared.
create or replace function drop_shared_recordings_without_consent() returns trigger
language plpgsql as $$
begin
  delete from shared_recordings r
   using class_members m
   where r.class_id = new.id and m.class_id = r.class_id and m.user_id = r.user_id
     and m.parental_consent_at is null;
  return new;
end
$$;
create or replace trigger classes_minors_shared_recordings_cleanup
  after update of minors on classes
  for each row when (new.minors and not old.minors)
  execute function drop_shared_recordings_without_consent();
