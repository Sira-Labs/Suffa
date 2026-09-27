-- Transcript corrections as AI suggestions (owner feedback 2026-09-26): Arabic that speech
-- recognition wrote in Latin letters ("Hather Beiton") is proposed in Arabic letters; the
-- teacher accepts each correction, which then replaces the line in the transcript.
alter table media_suggestions drop constraint if exists media_suggestions_kind_check;
alter table media_suggestions add constraint media_suggestions_kind_check
  check (kind in ('chapter', 'checkpoint', 'fix'));

-- EU models only, like every task that reads a recording's transcript (migration 0025).
insert into ai_model_routes
  (task, position, provider, model, effort, max_tokens, capabilities, premium, price_input, price_output)
values
  ('recording.proofread', 0, 'mistral', 'ministral-14b-latest', null, 4000,
   array['tools', 'structuredOutput', 'streaming'], false, 0.2, 0.2),
  ('recording.proofread', 1, 'mistral', 'ministral-8b-latest', null, 4000,
   array['tools', 'structuredOutput', 'streaming'], false, 0.15, 0.15)
on conflict (task, position) do nothing;
