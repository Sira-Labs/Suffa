# ADR-0012: Interactive YouTube lessons (Muhammad al-Andalusi as first channel)

- Status: proposed
- Date: 2026-09-23

## Context

The user wants Muhammad al-Andalusi's YouTube lessons integrated **interactively**. Today
`Library.tsx` embeds a plain iframe. We may not download or re-host videos.

## Decision

- **Catalog in Postgres** (`video_channels`, `videos`, `video_segments`, `video_checkpoints`,
  `video_transcripts`). Channel/playlist IDs are admin configuration.
- **Import job** (worker) uses **YouTube Data API v3** (`playlistItems.list`, `videos.list`) to
  fetch metadata (title, duration, thumbnails); runs on demand and nightly. API key in env.
- **Player** uses the **YouTube IFrame Player API** (`youtube-nocookie.com` host for privacy):
  `onStateChange` + a 250 ms time poll trigger checkpoints; the player pauses, the checkpoint
  UI (reusing exam/recall components) renders, then playback resumes.
- **Checkpoint types:** `mcq`, `dictation` (type what you heard), `shadow` (repeat, optional
  STT scoring), `vocab_flash` (with "add to SRS"), `ask_tutor`.
- **Authoring:** admin/teacher timeline editor (scrub, add checkpoint at current time).
  AI-assist can _suggest_ checkpoints from a transcript; a human approves.
- **Transcripts:** only where licensed or provided; stored as cues `{start, end, text}`.
- **Progress** is a new sync table `video_progress` (same LWW semantics).
- **Rights:** standard embed only; contact Muhammad al-Andalusi for permission to (a) feature
  the channel by name, (b) use/derive transcripts, (c) link exercises to his lessons.
  `video_channels.permission_status` tracks this; features (b)/(c) are off until `granted`.

## Alternatives

- Download + self-host video (HLS): best UX/offline, but violates YouTube ToS and creator rights.
- Plain links: no interactivity.

## Consequences

Video requires connectivity; everything around it (checkpoints, transcripts, progress) works
offline. YouTube quota (10k units/day default) is ample for catalog imports.
