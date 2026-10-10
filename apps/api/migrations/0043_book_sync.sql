-- The book follows the author's recording (Medina course, ADR-0025 addendum): for each lesson,
-- when each page of the book starts in the recording and, once marked, where each line sits on
-- its page image and when it is read. Only seconds and page coordinates are stored: the book's
-- pages and the recording stay at archive.org (ADR-0023). Admins edit, everyone reads.

create table if not exists book_sync (
  course     text not null check (course ~ '^[a-z][a-z0-9-]{0,39}$'),
  book       integer not null check (book between 1 and 9),
  lesson     integer not null check (lesson between 1 and 99),
  -- { pages: [{ page, at }], lines: [{ page, box: [x, y, w, h], start, end }] }, validated
  -- by the API (src/booksync/schema.ts).
  data       jsonb not null,
  revision   integer not null check (revision > 0),
  updated_by uuid references users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (course, book, lesson)
);
