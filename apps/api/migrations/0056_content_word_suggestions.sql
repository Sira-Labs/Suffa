-- Words for Muslims in Europe (story 18.4, ADR-0034): an LLM suggests words a unit lacks, a
-- reviewer accepts (as suggested or corrected) or rejects each one. Suggestions wait here,
-- apart from the units: only an accepted one is written into its unit's draft, and from there
-- it takes the unit's usual way to learners. Nothing that builds a bundle reads this table.

create table if not exists content_word_suggestions (
  id           uuid primary key default gen_random_uuid(),
  unit_id      text not null references content_units (id) on delete cascade,
  ar           text not null check (length(ar) between 1 and 300),
  -- Transliteration, as in the unit files.
  tr           text not null check (length(tr) between 1 and 300),
  de           text not null check (length(de) between 1 and 300),
  wurzel       text not null default '' check (length(wurzel) <= 300),
  plural       text check (plural is null or length(plural) between 1 and 300),
  -- Why the word fits the unit and its learners, in German, for the reviewer.
  reason       text check (reason is null or length(reason) between 1 and 500),
  -- The Arabic without vowel signs and article: one suggestion per word and unit, also
  -- after a rejection, so a rejected word is not suggested again.
  ar_plain     text not null,
  model        text not null,
  status       text not null default 'suggested'
                 check (status in ('suggested', 'accepted', 'rejected')),
  suggested_by uuid references users (id) on delete set null,
  suggested_at timestamptz not null default now(),
  decided_by   uuid references users (id) on delete set null,
  decided_at   timestamptz,
  -- The id the word got in the unit when it was accepted.
  word_id      text,
  unique (unit_id, ar_plain)
);

create index if not exists content_word_suggestions_queue_idx
  on content_word_suggestions (status, unit_id);
