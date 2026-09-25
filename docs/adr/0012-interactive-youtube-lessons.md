# ADR-0012: Interactive YouTube lessons (Muhammad al-Andalusi as first channel)

- Status: accepted (implemented in Sprint 12)
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

Amended by ADR-0018: the catalog is generalised to `media_items` (`source = youtube | hosted`)
so the teacher's own recordings use the same player, checkpoints and transcripts. Delivery
moved to Sprint 12, after the recordings pipeline (Sprints 7–8) that builds the shared player.

## Implementation (Sprint 12)

- Catalog tables `video_channels` (playlists, permission status, notes, contact date, last
  import), `videos` (unit, visibility, playlist position), `video_checkpoints`,
  `video_transcripts`. The import runs on the `imports` queue (on demand and nightly) with
  `SUFFA_YOUTUBE_API_KEY`; private and not embeddable videos are skipped; the unit is guessed
  from the title and an admin's mapping is kept. Permission changes are audit-logged.
- The catalog is public (`GET /api/v1/videos`); checkpoints and transcripts are only returned
  when the channel's permission is `granted`.
- Player: `youtube-nocookie.com` embed with `playsinline=1`, driven through the IFrame API; a
  250 ms position poll triggers checkpoints (the recordings' dialog, ±0.5 s window) with
  `pauseVideo`/`playVideo`. The transcript follows along; tapping a word shows its course
  meaning (offline lookup, vowels/article/conjunctions ignored). Admins edit checkpoints and the
  transcript on the lesson page with the recording editors.
- Progress is a track `yt/<videoId>` in `media_progress` (source `video-lesson`): watching to the
  end earns track XP and counts for listening quests; the new daily quest "Schau eine
  Videolektion ganz an" joins from 2026-09-27 where the catalog has lessons.
- `video_progress` as a separate sync table was not needed; `shadow` and `ask_tutor`
  checkpoint kinds are not built yet.
