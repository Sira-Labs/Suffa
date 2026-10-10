-- Book sync rows that are still the automatic suggestion (tools/content/madinah-book-sync.mjs)
-- and that no admin has saved yet. A better suggestion replaces them at start-up; a row an
-- admin saved is never replaced again (ADR-0025 addendum).

alter table book_sync add column if not exists suggested boolean not null default false;

-- Until now only the seed wrote rows without an editor.
update book_sync set suggested = true where updated_by is null and revision = 1;
