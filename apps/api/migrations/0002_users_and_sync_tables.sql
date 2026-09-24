-- Users and the five synced learning-data tables (ADR-0002, ADR-0007).
--
-- * Column names mirror supabase/schema.sql exactly (camelCase, quoted) so records travel
--   1:1 between the PWA, Supabase and this API during the migration.
-- * user ids are UUIDs and are preserved when users move over from Supabase; the auth
--   library (Better Auth, ADR-0008) is configured to use this table and UUID ids.
-- * Primary key (user_id, id): card ids are deterministic per user (e.g. 'vocab_ar_de:v-ism').
-- * (user_id, updated_at, id) indexes serve the keyset-paginated pull.

create table if not exists users (
  id         uuid primary key,
  email      text unique,
  name       text,
  role       text not null default 'student' check (role in ('student', 'teacher', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists srs_cards (
  user_id        uuid not null references users (id) on delete cascade,
  id             text not null,
  "contentRef"   text not null,
  kind           text not null,
  interval       integer not null default 0,
  ease           double precision not null default 2.5,
  reps           integer not null default 0,
  lapses         integer not null default 0,
  due            timestamptz not null,
  "lastReviewed" timestamptz,
  leech          boolean not null default false,
  updated_at     timestamptz not null,
  deleted        boolean not null default false,
  primary key (user_id, id)
);
create index if not exists srs_cards_sync_idx on srs_cards (user_id, updated_at, id);

create table if not exists review_logs (
  user_id             uuid not null references users (id) on delete cascade,
  id                  text not null,
  "cardId"            text not null,
  "contentRef"        text not null,
  kind                text not null,
  rating              text not null,
  "durationMs"        integer not null default 0,
  "scheduledInterval" integer not null default 0,
  "reviewedAt"        timestamptz not null,
  updated_at          timestamptz not null,
  deleted             boolean not null default false,
  primary key (user_id, id)
);
create index if not exists review_logs_sync_idx on review_logs (user_id, updated_at, id);

create table if not exists exam_results (
  user_id      uuid not null references users (id) on delete cascade,
  id           text not null,
  format       text not null,
  units        jsonb not null default '[]'::jsonb,
  score        integer not null default 0,
  total        integer not null default 0,
  items        jsonb not null default '[]'::jsonb,
  "startedAt"  timestamptz not null,
  "finishedAt" timestamptz not null,
  updated_at   timestamptz not null,
  deleted      boolean not null default false,
  primary key (user_id, id)
);
create index if not exists exam_results_sync_idx on exam_results (user_id, updated_at, id);

create table if not exists settings (
  user_id               uuid not null references users (id) on delete cascade,
  id                    text not null,
  key                   text not null,
  "tashkilLevel"        text not null default 'full',
  theme                 text not null default 'dark',
  "arabicFontScale"     double precision not null default 1,
  "dailyGoal"           integer not null default 20,
  "showTransliteration" boolean not null default true,
  "dialectNotes"        boolean not null default false,
  updated_at            timestamptz not null,
  deleted               boolean not null default false,
  primary key (user_id, id)
);
create index if not exists settings_sync_idx on settings (user_id, updated_at, id);

create table if not exists user_vocab (
  user_id    uuid not null references users (id) on delete cascade,
  id         text not null,
  ar         text not null,
  tr         text not null default '',
  de         text not null,
  wurzel     text not null,
  wazn       text,
  plural     text,
  einheit    integer not null default 1,
  hinweis    text,
  updated_at timestamptz not null,
  deleted    boolean not null default false,
  primary key (user_id, id)
);
create index if not exists user_vocab_sync_idx on user_vocab (user_id, updated_at, id);
