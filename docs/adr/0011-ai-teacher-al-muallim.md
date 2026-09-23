# ADR-0011: al-Muʿallim — grounded, tool-using AI teacher

- Status: proposed
- Date: 2026-09-23

## Context

A generic chatbot hallucinates vocalisation, drifts from the curriculum, and ignores what the
learner already knows. The app already has rich learner state (SRS cards, leeches, exam
results) and structured content (roots, patterns, conjugations).

## Decision

- **Grounding:** each request carries a _curriculum pack_ for the learner's current unit(s)
  (vocab, roots, dialogues, grammar notes) and a compact _learner snapshot_; large corpora
  (all units, video transcripts) are reached via retrieval (pgvector embeddings) or tools.
- **Tools, not free rein:** the model calls server tools (`lookup_vocab`, `get_root_family`,
  `get_learner_state`, `make_exercise`, `propose_srs_cards`, `get_video_segment`). Tools
  authorise against the caller's session; model output is never used for authorisation.
- **Structured outputs** for exercises and grades (zod schemas in `packages/shared`), so the UI
  renders them natively (reusing `RecallInput`, `Feedback`, `ArabicText`).
- **SRS stays deterministic:** the AI _proposes_ cards; the client schedules them with the
  existing engine and writes them to the outbox.
- **Validation layer** post-generation: tashkīl coverage, script sanity, schema, safety filter;
  one repair retry, then fallback message.
- **Pedagogical rules** in the system prompt: target language MSA, i+1, explain in the UI
  language, correct gently, prefer eliciting over telling, never issue religious rulings,
  respectful on religious/cultural topics, stricter content settings for classes marked `minors`.
- **Evals**: golden sets per task; teacher overrides feed new cases; route/prompt changes
  must not regress scores.
- **Privacy:** prompts contain first name at most; conversations retained 90 days by default.

## Alternatives

- Fine-tuning an open model on the book: expensive, stale on content change; revisit only if
  evals show frontier models underperform on vocalisation.
- Fully agentic tutor with long autonomous loops: unnecessary; turns are short and interactive.

## Consequences

Higher implementation effort than a plain chat box, but answers are consistent with the book,
exercises plug into existing UI, and quality is measurable.
