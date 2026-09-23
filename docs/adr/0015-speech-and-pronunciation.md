# ADR-0015: Server-side speech recognition for pronunciation feedback

- Status: proposed
- Date: 2026-09-23

## Context

`services/speech/recognition.ts` uses the browser's `webkitSpeechRecognition` (`ar-SA`):
unavailable in Firefox and some mobile browsers, returns text only, no scoring.

## Decision

- Add a `SpeechProvider` (same DI pattern) with two implementations: `BrowserSpeechProvider`
  (today) and `ServerSpeechProvider` → `POST /v1/speech/transcribe` → Hugging Face Whisper
  (Inference Provider or dedicated endpoint).
- Scoring v1: normalised (tashkīl-insensitive) edit distance between expected and recognised
  text using the existing `tashkil.ts` utilities + phoneme-pair heuristics for known minimal
  pairs (ع/ء, ح/ه, ق/ك …).
- Audio is processed transiently and **not stored** unless the learner submits it for teacher
  review (then RustFS bucket `suffa-uploads`, 30-day retention, ADR-0017).
- Browser STT remains the offline/zero-cost default; server STT is a per-class setting.

## Alternatives

- Dedicated pronunciation-assessment APIs (commercial): better phoneme scoring, higher cost and
  vendor lock-in; revisit when usage justifies it.

## Consequences

Consistent speaking practice across browsers; modest per-minute STT cost (see cost plan).
