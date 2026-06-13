-- ============================================================================
--  Al-Arabiyya bayna Yadayk – Supabase-Schema (Sync-Backend)
-- ----------------------------------------------------------------------------
--  Einspielen: Supabase-Dashboard → SQL Editor → dieses Skript ausführen,
--  danach supabase/policies.sql.
--
--  Designhinweise:
--   * Spaltennamen sind absichtlich camelCase und in DOPPELTEN ANFÜHRUNGS-
--     ZEICHEN definiert, weil der Client die Datensätze 1:1 (mit ihren
--     JS-Feldnamen wie "contentRef", "updated_at") via PostgREST upsertet.
--   * Primärschlüssel ist (user_id, id): Karten-IDs sind PRO NUTZER
--     deterministisch (z. B. 'vocab_ar_de:v-ism') und nur zusammen mit user_id
--     global eindeutig. Der Client upsertet mit onConflict='user_id,id'.
--   * "deleted" ist ein Soft-Delete-Tombstone; Last-Write-Wins läuft über
--     "updated_at" (siehe docs/adr/0002-sync-last-write-wins.md).
-- ============================================================================

-- SRS-Kartenzustand -----------------------------------------------------------
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

-- Review-Logs (append-only Ereignisse) ---------------------------------------
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

-- Prüfungsergebnisse ----------------------------------------------------------
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

-- Einstellungen (ein Singleton-Datensatz pro Nutzer) -------------------------
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

-- Eigene Vokabeln (nutzererstellte Inhalte) ----------------------------------
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
