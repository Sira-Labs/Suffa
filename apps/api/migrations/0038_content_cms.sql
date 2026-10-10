-- Content CMS (story 16.1, ADR-0014): course units move into Postgres with a draft, a review
-- and a published state. The unit JSON files of the web app are the seed (loaded at start-up,
-- see src/content/seed.ts); learners keep getting the bundled content until 16.2 serves
-- published bundles.

create table if not exists content_units (
  -- "<course>/<unit>", e.g. "bayna-yadayk/3".
  id                 text primary key,
  course             text not null,
  unit               integer not null check (unit between 1 and 999),
  title              text not null,
  state              text not null default 'draft'
                       check (state in ('draft', 'review', 'published')),
  -- The working copy: { titel, kulturnotiz?, vokabeln, dialoge, grammatik }.
  draft              jsonb not null,
  -- Bumped on every saved change of the draft; saves must name the revision they started from.
  revision           integer not null default 1 check (revision > 0),
  -- The revision a teacher checked; the unit is "checked" while it equals `revision`.
  checked_revision   integer,
  checked_by         uuid references users (id) on delete set null,
  checked_at         timestamptz,
  -- A teacher's note when sending a unit back from review.
  review_note        text,
  -- The unit file learners get (with `einheit` and `status`), null until first published.
  published          jsonb,
  published_revision integer,
  published_by       uuid references users (id) on delete set null,
  published_at       timestamptz,
  updated_by         uuid references users (id) on delete set null,
  updated_at         timestamptz not null default now(),
  unique (course, unit)
);

create index if not exists content_units_state_idx on content_units (state, course, unit);

-- Every content ID ever used, with the unit it belongs to. SRS cards point at these IDs
-- (contentRef), so an ID is never reused for something else, even after it was removed.
create table if not exists content_ids (
  id            text primary key,
  unit_id       text not null references content_units (id) on delete restrict,
  kind          text not null check (kind in ('vocab', 'dialog', 'grammar', 'question')),
  first_seen_at timestamptz not null default now()
);

create index if not exists content_ids_unit_idx on content_ids (unit_id);
