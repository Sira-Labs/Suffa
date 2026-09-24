-- Progress joins sync: unit practice (unlocks units, earns XP), started units, daily
-- check-ins, "Entdecken" progress and listening progress. Same shape as the tables of 0002:
-- camelCase columns as in the app, (user_id, id) keys, a keyset index for the pull.

create table if not exists practice_progress (
  user_id       uuid not null references users (id) on delete cascade,
  id            text not null,
  unit          integer not null,
  skill         text not null,
  "itemId"      text not null,
  "practisedAt" timestamptz not null,
  updated_at    timestamptz not null,
  deleted       boolean not null default false,
  primary key (user_id, id)
);
create index if not exists practice_progress_sync_idx
  on practice_progress (user_id, updated_at, id);

create table if not exists unit_enrollments (
  user_id     uuid not null references users (id) on delete cascade,
  id          text not null,
  book        integer not null,
  unit        integer not null,
  pace        text not null,
  "startedAt" timestamptz not null,
  "dueAt"     timestamptz not null,
  extended    boolean not null default false,
  updated_at  timestamptz not null,
  deleted     boolean not null default false,
  primary key (user_id, id)
);
create index if not exists unit_enrollments_sync_idx
  on unit_enrollments (user_id, updated_at, id);

create table if not exists daily_checkins (
  user_id     uuid not null references users (id) on delete cascade,
  id          text not null,
  "wordId"    text not null,
  "checkedAt" timestamptz not null,
  updated_at  timestamptz not null,
  deleted     boolean not null default false,
  primary key (user_id, id)
);
create index if not exists daily_checkins_sync_idx on daily_checkins (user_id, updated_at, id);

create table if not exists discover_progress (
  user_id         uuid not null references users (id) on delete cascade,
  id              text not null,
  "startedAt"     timestamptz,
  "openedAt"      timestamptz not null,
  pinned          boolean not null default false,
  "positionSec"   double precision,
  "playlistIndex" integer,
  "durationSec"   double precision,
  updated_at      timestamptz not null,
  deleted         boolean not null default false,
  primary key (user_id, id)
);
create index if not exists discover_progress_sync_idx
  on discover_progress (user_id, updated_at, id);

create table if not exists media_progress (
  user_id       uuid not null references users (id) on delete cascade,
  id            text not null,
  source        text not null,
  ref           text not null,
  "lessonKey"   text not null,
  "durationSec" double precision not null default 0,
  "listenedSec" double precision not null default 0,
  "completedAt" timestamptz,
  updated_at    timestamptz not null,
  deleted       boolean not null default false,
  primary key (user_id, id)
);
create index if not exists media_progress_sync_idx on media_progress (user_id, updated_at, id);
