-- Mistral (EU) as an AI provider, and lesson summaries from recording transcripts.
-- Owner decision 2026-09-26: transcripts of the teachers' recordings go only to EU providers,
-- so the recording tasks route to Mistral; the US routes stay listed but switched off.

alter table ai_model_routes drop constraint if exists ai_model_routes_provider_check;
alter table ai_model_routes add constraint ai_model_routes_provider_check
  check (provider in ('anthropic', 'openrouter', 'huggingface', 'mistral'));

-- The recording tasks: switch off every non-Mistral route (also routes an admin changed)
-- and move those at positions 0 and 1 to the next free places (2–9), so Mistral takes the
-- front. A route with no free place left is removed: it is switched off anyway.
update ai_model_routes set enabled = false
 where task in ('recording.suggest', 'recording.summarize') and provider <> 'mistral';
do $$
declare
  r record;
  free smallint;
begin
  for r in
    select task, position from ai_model_routes
     where task in ('recording.suggest', 'recording.summarize') and provider <> 'mistral'
       and position < 2
     order by task, position
  loop
    select min(p) into free from generate_series(2, 9) as p
     where not exists (
       select 1 from ai_model_routes a where a.task = r.task and a.position = p);
    if free is null then
      delete from ai_model_routes where task = r.task and position = r.position;
    else
      update ai_model_routes set position = free
       where task = r.task and position = r.position;
    end if;
  end loop;
end $$;

-- Ministral 14B first: the Mistral tier at start does not include Medium/Small (0 requests
-- per minute); it wrote good German summaries with vocalised Arabic in testing. Switch to
-- mistral-medium-latest in admin → KI once the tier allows it.
-- Prices in USD per million tokens are estimates: check them in the Mistral console.
insert into ai_model_routes
  (task, position, provider, model, effort, max_tokens, capabilities, premium, price_input, price_output)
values
  ('recording.suggest', 0, 'mistral', 'ministral-14b-latest', null, 4000,
   array['tools', 'structuredOutput', 'streaming'], false, 0.2, 0.2),
  ('recording.suggest', 1, 'mistral', 'ministral-8b-latest', null, 4000,
   array['tools', 'structuredOutput', 'streaming'], false, 0.15, 0.15),
  ('recording.summarize', 0, 'mistral', 'ministral-14b-latest', null, 3000,
   array['tools', 'structuredOutput', 'streaming'], false, 0.2, 0.2),
  ('recording.summarize', 1, 'mistral', 'ministral-8b-latest', null, 3000,
   array['tools', 'structuredOutput', 'streaming'], false, 0.15, 0.15)
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
