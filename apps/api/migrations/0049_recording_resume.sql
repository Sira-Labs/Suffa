-- The worker picks up live recordings whose follow-up step was lost (ADR-0029): every few
-- minutes it looks for recordings nobody has checked on lately.

create index if not exists media_items_recording_idx
  on media_items (updated_at) where status = 'recording';
