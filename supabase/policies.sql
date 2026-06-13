-- ============================================================================
--  Row-Level-Security (RLS) Policies
-- ----------------------------------------------------------------------------
--  Jede Zeile gehört genau einem Nutzer. Niemand darf fremde Lerndaten sehen
--  oder verändern. Durchgesetzt über `user_id = auth.uid()` auf allen Tabellen.
--  Nach supabase/schema.sql ausführen.
-- ============================================================================

alter table public.srs_cards    enable row level security;
alter table public.review_logs  enable row level security;
alter table public.exam_results enable row level security;
alter table public.settings     enable row level security;
alter table public.user_vocab   enable row level security;

-- Hilfsmakro-Ersatz: pro Tabelle vier Policies (select/insert/update/delete).
-- INSERT erzwingt user_id = auth.uid() (auch wenn DEFAULT auth.uid() greift).

-- srs_cards -------------------------------------------------------------------
drop policy if exists srs_cards_select on public.srs_cards;
create policy srs_cards_select on public.srs_cards
  for select using (user_id = auth.uid());
drop policy if exists srs_cards_insert on public.srs_cards;
create policy srs_cards_insert on public.srs_cards
  for insert with check (user_id = auth.uid());
drop policy if exists srs_cards_update on public.srs_cards;
create policy srs_cards_update on public.srs_cards
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists srs_cards_delete on public.srs_cards;
create policy srs_cards_delete on public.srs_cards
  for delete using (user_id = auth.uid());

-- review_logs -----------------------------------------------------------------
drop policy if exists review_logs_select on public.review_logs;
create policy review_logs_select on public.review_logs
  for select using (user_id = auth.uid());
drop policy if exists review_logs_insert on public.review_logs;
create policy review_logs_insert on public.review_logs
  for insert with check (user_id = auth.uid());
drop policy if exists review_logs_update on public.review_logs;
create policy review_logs_update on public.review_logs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists review_logs_delete on public.review_logs;
create policy review_logs_delete on public.review_logs
  for delete using (user_id = auth.uid());

-- exam_results ----------------------------------------------------------------
drop policy if exists exam_results_select on public.exam_results;
create policy exam_results_select on public.exam_results
  for select using (user_id = auth.uid());
drop policy if exists exam_results_insert on public.exam_results;
create policy exam_results_insert on public.exam_results
  for insert with check (user_id = auth.uid());
drop policy if exists exam_results_update on public.exam_results;
create policy exam_results_update on public.exam_results
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists exam_results_delete on public.exam_results;
create policy exam_results_delete on public.exam_results
  for delete using (user_id = auth.uid());

-- settings --------------------------------------------------------------------
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings
  for select using (user_id = auth.uid());
drop policy if exists settings_insert on public.settings;
create policy settings_insert on public.settings
  for insert with check (user_id = auth.uid());
drop policy if exists settings_update on public.settings;
create policy settings_update on public.settings
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists settings_delete on public.settings;
create policy settings_delete on public.settings
  for delete using (user_id = auth.uid());

-- user_vocab ------------------------------------------------------------------
drop policy if exists user_vocab_select on public.user_vocab;
create policy user_vocab_select on public.user_vocab
  for select using (user_id = auth.uid());
drop policy if exists user_vocab_insert on public.user_vocab;
create policy user_vocab_insert on public.user_vocab
  for insert with check (user_id = auth.uid());
drop policy if exists user_vocab_update on public.user_vocab;
create policy user_vocab_update on public.user_vocab
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists user_vocab_delete on public.user_vocab;
create policy user_vocab_delete on public.user_vocab
  for delete using (user_id = auth.uid());
