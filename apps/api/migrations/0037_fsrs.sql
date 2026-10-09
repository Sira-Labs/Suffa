-- FSRS scheduling (story 15.6): the memory state of a card and the learner's choice, synced.
-- * srs_cards.stability / difficulty: FSRS-5 state, null for cards never reviewed with FSRS.
-- * settings."srsAlgorithm": 'sm2' (default when null) or 'fsrs'.
-- Older app versions do not send these columns; the sync then keeps the stored values.
alter table srs_cards add column if not exists stability double precision;
alter table srs_cards add column if not exists difficulty double precision;
alter table settings add column if not exists "srsAlgorithm" text;
alter table settings drop constraint if exists settings_srs_algorithm_check;
alter table settings add constraint settings_srs_algorithm_check
  check ("srsAlgorithm" is null or "srsAlgorithm" in ('sm2', 'fsrs'));
