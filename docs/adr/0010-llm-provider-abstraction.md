# ADR-0010: Provider-agnostic LLM gateway (Anthropic SDK, OpenRouter, Hugging Face)

- Status: proposed
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
