-- Interactive YouTube lessons (Sprint 12, ADR-0012): a catalog of channels and their videos,
-- imported from the YouTube Data API. Videos stay on YouTube (standard embed only).

create table if not exists video_channels (
  id                 uuid primary key,
  name               text not null check (length(name) between 1 and 120),
  youtube_channel_id text check (youtube_channel_id ~ '^UC[A-Za-z0-9_-]{22}$'),
  playlists          text[] not null default '{}',
  -- Permission from the creator (ADR-0012): transcripts and exercises only when 'granted'.
  permission_status  text not null default 'unknown'
                       check (permission_status in ('unknown', 'requested', 'granted', 'declined')),
  permission_notes   text not null default '' check (length(permission_notes) <= 4000),
  contacted_at       date,
  last_import_at     timestamptz,
  last_import_error  text,
  updated_by         uuid references users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists videos (
  id            uuid primary key,
  channel_id    uuid not null references video_channels (id) on delete cascade,
  youtube_id    text not null unique check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  title         text not null,
  duration_sec  integer,
  thumbnail_url text,
  published_at  timestamptz,
  playlist_id   text,
  position      integer not null default 0,
  -- Course unit the lesson belongs to (guessed from the title on import, set by an admin).
  unit          integer check (unit between 1 and 100),
  hidden        boolean not null default false,
  imported_at   timestamptz not null default now()
);
create index if not exists videos_channel_idx on videos (channel_id, playlist_id, position);
create index if not exists videos_unit_idx on videos (unit) where not hidden;

create table if not exists video_checkpoints (
  id         uuid primary key,
  video_id   uuid not null references videos (id) on delete cascade,
  at_sec     double precision not null check (at_sec >= 0),
  data       jsonb not null,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists video_checkpoints_video_idx on video_checkpoints (video_id, at_sec);

create table if not exists video_transcripts (
  video_id   uuid primary key references videos (id) on delete cascade,
  cues       jsonb not null default '[]'::jsonb,
  updated_by uuid references users (id) on delete set null,
  updated_at timestamptz not null default now()
);
