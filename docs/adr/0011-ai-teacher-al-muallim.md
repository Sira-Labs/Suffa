# ADR-0011: al-Muʿallim — grounded, tool-using AI teacher

- Status: accepted (implemented in Sprint 10)
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

## Implementation (Sprint 10)

- **Turn API:** `POST /api/v1/tutor/turn` streams server-sent events (`start`, `text`, `tool`,
  `replace`, `done`, `error`). Up to four model calls per turn (tool rounds; the last one
  without tools) count as one turn against the learner's quota.
- **Grounding:** the course content is read on the server from the same JSON files the app
  bundles (copied into the api image). Prompt order: persona in the tutoring language, the
  unit's curriculum pack (vocabulary, verbs, grammar rules, dialogues; built once per unit so
  the bytes stay identical for the prompt cache), then the learner snapshot (first name only,
  current unit, due cards, often-forgotten words, last test, tashkīl setting) and where the
  learner asks from (unit or a recording moment). Retrieval over all units and transcripts
  (pgvector) is deferred; tools cover the lookups for now.
- **Tools:** `lookup_vocab`, `get_root_family`, `get_learner_state`, `get_media_segment`.
  Inputs are validated (zod); the user id always comes from the session; a recording is
  readable only for active members of its class (students: published ones), and a forbidden
  recording is answered like an unknown one. `make_exercise` and `propose_srs_cards` follow
  with grading (Sprint 11).
- **Validators:** Arabic letters only (no Persian/Urdu forms), vocalisation coverage when the
  learner wants full tashkīl, no religious rulings (a judgement like "ist haram", not the
  word itself), not empty. One repair call; if it still fails on a blocking check, a calm
  fallback is shown. Findings are stored as `flags` with the answer.
- **Storage and privacy:** only the learner's message and the shown answer are kept
  (`ai_conversations`, `ai_messages`, with 👍/👎), deleted after 90 days of inactivity by
  the maintenance job, part of the data export, deleted with the account.
- **App:** "al-Muʿallim" under "Mehr": streamed answers, Arabic rendered with the learner's
  tashkīl level, suggestions, earlier conversations, ratings; "Frag al-Muʿallim zu dieser
  Minute" in the recording player. Writing Arabic to the tutor is a practice record
  (`tutor/<day>`, once a day) and counts for the new daily quest "Schreib al-Muʿallim etwas
  auf Arabisch", which is picked only from 2026-09-26 on and only where the tutor is
  available, so earlier days keep their quests and XP.
- Stricter settings for classes of minors are not built yet.
