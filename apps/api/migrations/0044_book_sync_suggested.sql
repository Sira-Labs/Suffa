-- Book sync rows that are still the automatic suggestion (tools/content/madinah-book-sync.mjs)
-- and that no admin has saved yet. A better suggestion replaces them at start-up; a row an
-- admin saved is never replaced again (ADR-0025 addendum).

alter table book_sync add column if not exists suggested boolean not null default false;

-- Until now only the seed wrote rows without an editor. A row whose admin was deleted since
-- (updated_by set null) is told apart by its save in the audit log.
update book_sync b set suggested = true
 where b.updated_by is null
   and b.revision = 1
   and not exists (
     select 1 from audit_log a
      where a.action = 'content.book_sync_saved'
        and a.target_type = 'book_sync'
        and a.target_id = b.course || '/' || b.book || '/' || b.lesson
   );
