-- ============================================================================
--  Al-Arabiyya bayna Yadayk – Supabase schema (sync backend)
-- ----------------------------------------------------------------------------
--  Setup: Supabase dashboard → SQL Editor → run this script,
--  then supabase/policies.sql.
--
--  Design notes:
--   * Column names are deliberately camelCase and defined in DOUBLE QUOTES,
--     because the client upserts records 1:1 (with their JS field names such
--     as "contentRef", "updated_at") via PostgREST.
--   * The primary key is (user_id, id): card IDs are deterministic PER USER
--     (e.g. 'vocab_ar_de:v-ism') and only globally unique together with
--     user_id. The client upserts with onConflict='user_id,id'.
--   * "deleted" is a soft-delete tombstone; last-write-wins is based on
--     "updated_at" (see docs/adr/0002-sync-last-write-wins.md).
-- ============================================================================

-- SRS card state --------------------------------------------------------------
create table if not exists public.srs_cards (
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
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
create index if not exists srs_cards_updated_at_idx on public.srs_cards (user_id, updated_at);

-- Review logs (append-only events) -------------------------------------------
create table if not exists public.review_logs (
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
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
create index if not exists review_logs_updated_at_idx on public.review_logs (user_id, updated_at);

-- Exam results ----------------------------------------------------------------
create table if not exists public.exam_results (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
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
create index if not exists exam_results_updated_at_idx on public.exam_results (user_id, updated_at);

-- Settings (one singleton record per user) -----------------------------------
create table if not exists public.settings (
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id                   text not null,
  key                  text not null,
  "tashkilLevel"       text not null default 'full',
  theme                text not null default 'dark',
  "arabicFontScale"    double precision not null default 1,
  "dailyGoal"          integer not null default 20,
  "showTransliteration" boolean not null default true,
  "dialectNotes"       boolean not null default false,
  updated_at           timestamptz not null,
  deleted              boolean not null default false,
  primary key (user_id, id)
);

-- Custom vocabulary (user-created content) -----------------------------------
create table if not exists public.user_vocab (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
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
create index if not exists user_vocab_updated_at_idx on public.user_vocab (user_id, updated_at);
