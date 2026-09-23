# ADR-0018: Teacher session recordings — Google Drive import and hosted media lessons

- Status: proposed
- Date: 2026-09-24
- Amends: ADR-0012 (checkpoint engine becomes source-agnostic)

## Context

The pilot teacher has recordings of his live sessions in **Google Drive** and wants to use
them in Suffa. Students should be able to re-watch/listen, ideally offline, with the same
interactivity planned for YouTube lessons (checkpoints, transcript, add-to-SRS, ask the tutor).

## Decision

### Import

- Teacher connects Google Drive from the teacher workspace (separate OAuth consent from
  login). Scope **`drive.file`** + **Google Picker**: the teacher picks the recordings; we can
  only access the files he picks. This avoids restricted scopes (`drive.readonly`) that
  require Google's security assessment.
- The worker downloads each picked file via the Drive API (streamed), stores the original in
  RustFS `arabictutor-media/originals/<classId>/<mediaId>` (ADR-0017), then enqueues processing.
- **Direct upload** (presigned multipart) is the second entry path into the same pipeline, for
  recordings not in Drive (phone, Zoom export).
- OAuth refresh tokens are encrypted at rest (AES-256-GCM, key `SUFFA_ENCRYPTION_KEY`); the
  teacher can disconnect at any time; already imported copies stay until deleted.

### Processing pipeline (worker, `ffmpeg` in the image)

1. Probe → 2. transcode: **audio-only** Opus/AAC ~64 kbps (small, offline-friendly) and, for
   video, 720p H.264 MP4 with `faststart` (HLS later if needed) → 3. **transcribe** with Whisper
   (HF Inference Endpoint, or `faster-whisper` inside the worker for zero marginal cost) → 4. AI suggests chapters, key vocabulary and checkpoints → 5. **teacher reviews and publishes**
   to one or more classes. Nothing AI-generated is published without teacher approval.

### Lessons model

- ADR-0012's video catalog is generalised to **`media_items`** with `source ∈ {youtube, hosted}`;
  segments, checkpoints, transcripts and the player UI are shared. `video_progress` becomes
  `media_progress` (same LWW sync semantics).
- Students can **download the audio version for offline listening** (PWA cache storage /
  Capacitor filesystem); checkpoints work offline.

### Privacy & consent

- Recordings may contain students' voices/faces: the teacher confirms participant consent
  (parental consent for minors) when publishing; access is limited to class members;
  URLs are short-lived presigned; teacher or admin can delete media and derived data;
  a per-class switch disables AI processing (no transcription sent to third parties). With the
  `faster-whisper` option, transcription never leaves our server.

## Alternatives

- Embed Drive's preview player: requires link sharing (leaks), no player API for checkpoints,
  no offline, no transcript.
- Full-Drive sync (`drive.readonly`): convenient but a restricted scope (security assessment,
  more access than needed).
- Upload to YouTube as unlisted: loses control, ads/recommendations, unclear consent position.

## Consequences

One interactive-lesson engine for YouTube and own recordings. Storage and CPU grow with
recordings (see cost plan). Google Cloud project + OAuth consent screen (in "testing" mode is
fine for one teacher, up to 100 test users; production verification for `drive.file` is light).
