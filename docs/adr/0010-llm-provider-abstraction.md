# ADR-0010: Provider-agnostic LLM gateway (Anthropic SDK, OpenRouter, Hugging Face)

- Status: accepted (implemented in Sprint 9)
- Date: 2026-09-23

## Context

The AI teacher must be able to use **Anthropic** models (via the official SDK), models on
**OpenRouter**, and models on **Hugging Face** (Inference Providers or dedicated endpoints) —
for quality, cost and sovereignty trade-offs. Keys must never reach the browser. Costs must be
controlled per user, per role and globally.

## Decision

- New package `packages/llm` with an `LlmProvider` interface (`stream`, `complete`) and a
  `ModelRouter` that maps a **task** (not a model) to provider + model + params + fallbacks.
  Same DI pattern as `SyncProvider` (ADR-0004).
- Adapters:
  - `AnthropicProvider` — official `@anthropic-ai/sdk`; uses prompt caching for the stable
    system/curriculum prefix, adaptive thinking with `output_config.effort`, structured outputs,
    typed SDK errors for retry/fallback decisions, Batch API for offline generation.
  - `OpenRouterProvider` — OpenRouter's OpenAI-compatible chat completions API for non-Claude
    models (open-weight Arabic-capable models).
  - `HuggingFaceProvider` — HF Inference Providers chat-completion API or a dedicated
    Inference Endpoint URL; also embeddings and Whisper STT.
- Routing table lives in Postgres (`ai_model_routes`), editable in the admin panel, cached in
  memory for 60 s. Defaults in `02-technical-spec.md` §6.1.
- **Budget guard** runs before every call: per-user daily turns/tokens (by role/class),
  global monthly € budget; when 80 % is reached the router **downgrades** to cheaper routes,
  at 100 % AI features become read-only with a friendly message.
- Every call logs provider, model, tokens (incl. cache reads), latency and computed cost.
- Feature parity is not assumed: a task declares required capabilities
  (`tools`, `structuredOutput`, `vision`, `streaming`) and the router only picks compatible models.

## Alternatives

- Vercel AI SDK / LangChain as the abstraction: faster start, but extra dependency surface and
  weaker access to provider-specific features (Anthropic caching, batches). Our interface is
  ~100 lines; adapters stay thin.
- Anthropic only: simplest, but the user explicitly wants open models and HF.
- Calling everything through OpenRouter (including Claude): one bill, but loses first-party
  features (Batch API, fine-grained caching control) and adds a middleman to user data.

## Consequences

Model choice becomes an admin setting, not a deploy. Adapters need contract tests with
recorded fixtures. Quality differs across models — evals (ADR-0011) gate route changes.

## Implementation (Sprint 9)

- `packages/llm`: `LlmProvider` (`complete`, `stream`), typed `LlmError` kinds that say
  whether another route may succeed, a price list in USD per MTok (= µ$ per token).
  `AnthropicProvider` sets one cache breakpoint after the last stable system part, sends
  `output_config.effort` only to models that take it and structured output as
  `output_config.format`. OpenRouter and Hugging Face share one OpenAI-compatible adapter.
  A contract suite runs all adapters against recorded wire fixtures; a live prompt-cache
  check runs only with `SUFFA_LLM_LIVE_ANTHROPIC_KEY`.
- `ModelRouter`: routes per task from `ai_model_routes` (cached 60 s, the last table kept
  when a reload fails), filtered by configured provider, `enabled` and capabilities (a JSON
  schema implies `structuredOutput`, streaming implies `streaming`). A fallbackable error or
  a refusal moves to the next route; a stream falls back only before its first token.
- Budget: `ai_settings` (monthly budget, downgrade %, daily turns per role, admins
  unlimited by default). Economy mode skips routes marked `premium`; at 100 % calls stop
  with `ai_paused`. The learner's day follows their time zone.
- Metering: every call (also failures and pauses) is one `ai_calls` row with tokens incl.
  cache reads/writes, cost, latency and all attempts; `ai_usage_daily` and
  `ai_spend_monthly` are updated in the same transaction, so the checks read exact counters.
- Admin: `/api/v1/admin/ai` (admin + second factor) shows providers, routes, budget and the
  last 30 days by task/model; routes per task and the budget are editable (audit-logged),
  and a route can be tried with a prompt.
- Tool calls, embeddings and speech-to-text routes follow with al-Muʿallim (Sprint 10).

## Update 2026-09-26: Mistral (EU) and EU-only routes for recordings

- **Mistral La Plateforme** is a fourth provider (`mistralProvider`, OpenAI-compatible,
  `SUFFA_MISTRAL_API_KEY`). It streams without `stream_options` and reports usage in the
  last chunk.
- **Recordings stay in the EU** (owner decision): the tasks that send a recording's
  transcript to a model, `recording.suggest` and the new `recording.summarize`, route to
  `mistral-medium-latest` then `mistral-small-latest` (migration 0025). Their Anthropic
  routes remain listed but switched off, so a Mistral outage cannot fall back to the US.
  Other tasks (tutor, grading) keep their routes.
- Prices for the Mistral routes are estimates in the routing table; check them in the
  Mistral console and correct them in the admin area.
