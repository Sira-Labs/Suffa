-- Mistral (EU) as an AI provider, and lesson summaries from recording transcripts.
-- Owner decision 2026-09-26: transcripts of the teachers' recordings go only to EU providers,
-- so the recording tasks route to Mistral; the US routes stay listed but switched off.

alter table ai_model_routes drop constraint if exists ai_model_routes_provider_check;
alter table ai_model_routes add constraint ai_model_routes_provider_check
  check (provider in ('anthropic', 'openrouter', 'huggingface', 'mistral'));

-- recording.suggest: move the Anthropic routes behind Mistral and switch them off.
update ai_model_routes set position = position + 2, enabled = false
 where task = 'recording.suggest' and provider = 'anthropic' and position < 2;

-- Prices in USD per million tokens are estimates: check them in the Mistral console.
insert into ai_model_routes
  (task, position, provider, model, effort, max_tokens, capabilities, premium, price_input, price_output)
values
  ('recording.suggest', 0, 'mistral', 'mistral-medium-latest', null, 4000,
   array['tools', 'structuredOutput', 'streaming'], false, 0.4, 2),
  ('recording.suggest', 1, 'mistral', 'mistral-small-latest', null, 4000,
   array['tools', 'structuredOutput', 'streaming'], false, 0.1, 0.3),
  ('recording.summarize', 0, 'mistral', 'mistral-medium-latest', null, 3000,
   array['tools', 'structuredOutput', 'streaming'], false, 0.4, 2),
  ('recording.summarize', 1, 'mistral', 'mistral-small-latest', null, 3000,
   array['tools', 'structuredOutput', 'streaming'], false, 0.1, 0.3)
on conflict (task, position) do nothing;

-- One summary per recording: made by AI from the transcript, seen by learners only after the
-- teacher publishes it.
create table if not exists media_summaries (
  media_id     uuid primary key references media_items (id) on delete cascade,
  status       text not null check (status in ('queued', 'running', 'ready', 'failed')),
  -- {"overview", "points": [...], "vocabulary": [{"ar", "de"}], "grammar": [...]}
  summary      jsonb,
  error        text,
  model        text,
  requested_by uuid references users (id) on delete set null,
  published_at timestamptz,
  published_by uuid references users (id) on delete set null,
  updated_at   timestamptz not null default now()
);
