-- English drafts for course content (story 16.4, ADR-0021): the CMS asks the LLM to translate
-- German glosses; a teacher checks them before they are published. Own course content only,
-- but routed to Mistral (EU) like the recording tasks; switch models in admin → KI.
-- Prices in USD per million tokens are estimates: check them in the Mistral console.
insert into ai_model_routes
  (task, position, provider, model, effort, max_tokens, capabilities, premium, price_input, price_output)
values
  ('content.translate', 0, 'mistral', 'ministral-14b-latest', null, 8000,
   array['tools', 'structuredOutput', 'streaming'], false, 0.2, 0.2),
  ('content.translate', 1, 'mistral', 'ministral-8b-latest', null, 8000,
   array['tools', 'structuredOutput', 'streaming'], false, 0.15, 0.15)
on conflict (task, position) do nothing;
