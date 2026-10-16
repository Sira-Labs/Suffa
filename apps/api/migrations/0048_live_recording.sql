-- Recording live lessons (ADR-0029, Live 3): the teacher records a live session on the server
-- (LiveKit Egress); the file lands in the class's recordings like an upload and goes through
-- the same transcode → transcript → suggestions chain, unpublished until the teacher shares it.
--
-- * media_items gains the source 'live' and the status 'recording' (the egress is running) and
--   the egress id, so the worker can follow the recording until its file is stored.
-- * A live session points at the recording running in it, if any; one at a time.

alter table media_items drop constraint if exists media_items_source_check;
alter table media_items
  add constraint media_items_source_check check (source in ('upload', 'drive', 'live'));

alter table media_items drop constraint if exists media_items_status_check;
alter table media_items
  add constraint media_items_status_check
    check (status in ('uploading', 'importing', 'recording', 'processing', 'ready', 'failed'));

alter table media_items add column if not exists egress_id text;

alter table live_sessions
  add column if not exists recording_media_id uuid references media_items (id) on delete set null;
