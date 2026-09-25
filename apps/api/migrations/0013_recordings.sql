-- Teacher recordings (Sprint 7, ADR-0017/0018): a class's session recordings, uploaded in
-- parts or imported from Google Drive, transcoded by the worker, played from object storage.

create table if not exists media_items (
  id                  uuid primary key,
  class_id            uuid not null references classes (id) on delete cascade,
  created_by          uuid references users (id) on delete set null,
  title               text not null check (length(title) between 1 and 120),
  source              text not null check (source in ('upload', 'drive')),
  status              text not null
                        check (status in ('uploading', 'importing', 'processing', 'ready', 'failed')),
  original_key        text not null,
  original_name       text check (length(original_name) <= 255),
  original_size       bigint not null check (original_size >= 0),
  content_type        text not null,
  upload_id           text,
  drive_file_id       text,
  duration_sec        double precision,
  has_video           boolean,
  renditions          jsonb not null default '{}'::jsonb,
  progress            integer not null default 0 check (progress between 0 and 100),
  error               text,
  published_at        timestamptz,
  consent_confirmed_by uuid references users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists media_items_class_idx on media_items (class_id, created_at desc);
