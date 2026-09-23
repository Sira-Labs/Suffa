# ADR-0022: Pronunciation assessment with Arabic speech models

- Status: proposed
- Date: 2026-09-23
- Extends: ADR-0015 (server speech recognition)

## Context

ADR-0015 moves speech recognition to the server (Whisper) and scores by comparing the
recognised text with the expected text. That tells a learner _whether_ a word was understood,
not _which sound_ was wrong. The typical problems of German- and English-speaking learners are
sound-level: emphatics (ص ض ط ظ), pharyngeals (ع ح), uvulars (ق خ غ), hamza, long vs. short
vowels and shadda. Speech recognisers also "autocorrect" towards real words, hiding exactly
these errors.

Good news for Arabic: fully vocalised MSA (which all Suffa content is) is almost phonemic, so
the expected phoneme sequence can be derived by rules from the text we already have.

## Decision

1. **`PronunciationAssessor` interface** (same DI pattern as `SyncProvider` / `LlmProvider`):
   `assess(audio, expectedVocalisedText) → { overall, words[], letters[] (score, class, tip), transcript }`.
   Implementations, selectable per class by the admin:
   - `BrowserAssessor`: today's Web Speech text comparison (free, offline fallback).
   - `AsrAssessor`: Whisper-class ASR + tashkīl-tolerant text diff (ADR-0015 v1).
   - `PhonemeAssessor` (**target**): a phoneme recogniser (CTC) aligned against the expected
     phonemes from our G2P, scoring each phoneme; minimal-pair confusions weighted.
   - `ExternalAssessor`: adapter for a commercial pronunciation-assessment API, if one proves
     better for Arabic in the evaluation.
2. **Rule-based G2P for vocalised MSA** (`packages/phonology`): shadda → gemination, sun-letter
   assimilation after _al-_, hamzat al-waṣl, tanwīn, tāʾ marbūṭa (pausal/connected), alif
   maqṣūra, long vowels. It keeps an index back to the source letters, so the UI can highlight
   the exact letter that went wrong. Unit-tested against the Book 1 vocabulary.
3. **Candidate models to evaluate** (all must be verified for quality, licence and price at
   evaluation time):
   - ASR: `openai/whisper-large-v3` / `-turbo` (multilingual, strong Arabic), Arabic
     fine-tunes of Whisper, Meta MMS (`facebook/mms-1b-all`), wav2vec2 XLS-R Arabic
     fine-tunes (e.g. `jonatasgrosman/wav2vec2-large-xlsr-53-arabic`); for Qurʾānic recitation
     later: Tarteel's Whisper fine-tunes.
   - Phoneme recognition: `facebook/wav2vec2-xlsr-53-espeak-cv-ft` (multilingual IPA
     phonemes) and a Suffa fine-tune on Arabic phonemes once enough consented data exists.
   - Commercial APIs with pronunciation scores (e.g. Microsoft Azure Speech pronunciation
     assessment, Speechace, SpeechSuper): only if their **Arabic** support is confirmed.
   - Hosting: Hugging Face Inference Endpoints (GPU, scale to zero) or a CPU container on
     CapRover for small models; same `HF_TOKEN` as ADR-0010.
4. **Evaluation before choosing** (no model is chosen by reputation):
   - Data: during the pilot (from January 2027), with consent, ~300 recordings (≈ 10 students ×
     30 items) plus the teacher's reference recordings; the teacher rates each item (1–5) and
     marks wrong letters.
   - Metrics: agreement with the teacher (Spearman ρ for item scores, F1 for wrong-letter
     detection), **false rejections of correct pronunciations** (most harmful to motivation,
     target ≤ 5 %), latency p95 (target ≤ 3 s per word), cost per minute, and whether audio
     leaves our infrastructure.
   - The harness lives next to the AI evals (ADR-0011) and re-runs when a model changes.
5. **Feedback, not a verdict**: letters coloured good / check / wrong (three classes, no fake
   precision), replay own vs. reference audio (teacher recording preferred; TTS only as a
   fallback for listening, never as scoring ground truth), one concrete tip per sound (e.g. how
   to form ع). al-Muʿallim receives the _structured_ errors (not the audio) and explains them in
   the learner's tutoring language (ADR-0021).
6. **Privacy**: audio is processed transiently by default; stored only when the learner submits
   it for teacher review or explicitly donates it to the evaluation set (RustFS
   `suffa-uploads`, retention per ADR-0017); stricter defaults for classes flagged `minors`.

## Alternatives

- ASR text comparison only (ADR-0015 v1): cheap, but blind to the sounds learners actually
  struggle with; kept as a fallback.
- Commercial API from day one: fastest to integrate, but Arabic coverage and quality are
  uncertain, cost grows per minute, and audio leaves our servers.
- End-to-end "audio LLM judges pronunciation": attractive, but hard to evaluate and prone to
  confident wrong feedback; may be revisited as a second opinion.

## Consequences

Pronunciation feedback becomes specific enough to practise with. It needs a small phonology
package, an evaluation harness and consented pilot data, so the phoneme assessor ships after
the pilot has produced data (Sprint 15), with the ASR assessor as the interim default.
