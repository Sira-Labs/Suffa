-- Meanings in further languages (story 18.4, ADR-0031): an LLM drafts the meaning of a word
-- in Turkish, Italian, Bosnian or Albanian and a teacher approves, corrects or rejects it.
-- The drafts live here, apart from `content_units.draft`: publishing a unit copies its whole
-- draft into the bundle, so a meaning kept there would reach learners with the next German
-- fix. Nothing reads this table when a bundle is made.

create table if not exists content_meaning_drafts (
  id          uuid primary key default gen_random_uuid(),
  unit_id     text not null references content_units (id) on delete cascade,
  -- The word's id in the unit ("u03-v012"); ids are never reused (content_ids).
  word_id     text not null,
  language    text not null check (language in ('tr', 'it', 'bs', 'sq')),
  -- The German the meaning was drafted from; the draft is stale once the word's German differs.
  source_de   text not null,
  text        text not null check (length(text) between 1 and 500),
  model       text not null,
  status      text not null default 'draft'
                check (status in ('draft', 'approved', 'rejected')),
  drafted_by  uuid references users (id) on delete set null,
  drafted_at  timestamptz not null default now(),
  reviewed_by uuid references users (id) on delete set null,
  reviewed_at timestamptz,
  unique (unit_id, word_id, language)
);

create index if not exists content_meaning_drafts_queue_idx
  on content_meaning_drafts (language, status, unit_id);
