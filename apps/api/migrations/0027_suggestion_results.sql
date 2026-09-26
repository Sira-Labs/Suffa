-- What an accepted AI suggestion became (a checkpoint or chapter id): removing that item puts
-- the suggestion back up for decision.
alter table media_suggestions add column if not exists result_id uuid;
create index if not exists media_suggestions_result_idx
  on media_suggestions (media_id, result_id) where result_id is not null;
