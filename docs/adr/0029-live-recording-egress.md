# ADR-0029: Recording live lessons on our own server

- Status: accepted (owner, 16 Oct 2026)
- Date: 2026-10-16

## Context

Teachers want a live lesson (ADR-0026) to end up in the class's recordings, so learners can
listen again with the transcript, chapters and "ask about this minute" (Sprints 7–11). Pictures
and voices from the room must stay in the EU and on our servers. Nothing may go to a US
provider (ADR-0018). The lessons include sisters' and brothers' sessions, so who is seen in a
recording matters as much as who is heard. Everyone in the room has to know that it is being
recorded, before and while it happens.

Options considered:

1. **Record in the teacher's browser** (MediaRecorder) and upload the file. No extra server,
   but the recording depends on the teacher's device and connection. It also misses the
   learners' voices unless the browser mixes them, and a closed tab loses the lesson.
2. **LiveKit Egress on our server.** A headless Chrome joins the room as a hidden participant,
   records a page we control, and writes an MP4 into our object store. This is LiveKit's own
   recorder, self-hosted (Apache-2.0).
3. **A hosted recorder** (LiveKit Cloud and others). Ruled out: media would leave our servers.

## Decision

Option 2, decided with the owner ("Auf dem Server").

- **What is recorded:** the teacher and everyone given the floor ("Lehrkraft +
  Wortmeldungen").
  - The picture is the teacher's stage as in the room: the shared screen with the teacher's
    camera small in the corner, else the camera.
  - The sound is every voice that may speak: the teacher, the screen's sound, and learners
    while they have the floor. Listeners publish nothing, so they are not in it.
  - A learner's camera is never recorded, also when the session allows learner cameras.
  - Names and the chat are not in the picture.
- **Our recording page:** Egress opens `live-record.html` (a small page of the web app, no app
  shell, no service worker, translation turned off). It joins with the token Egress gives it,
  shows the stage at 1280×720 and plays the voices. It signals `START_RECORDING` and
  `END_RECORDING`, Egress's template protocol. The page subscribes to everything, because
  LiveKit connects a subscriber only once there is something to receive. It gives a learner's
  picture back at once and never shows it.
- **Started and stopped by the teacher** in the room, after a confirmation that says what is
  recorded. Ending the session stops the recording. Only one recording runs per session at a
  time. Starting and stopping are audit-logged.
- **Everyone is told:**
  - Before joining, the room says that the teacher may record the lesson, what would be
    recorded, and whether a recording is running right now.
  - While recording, everyone sees "Aufnahme läuft". LiveKit reports a running egress to every
    client.
  - Learners are told when it starts or stops, and a learner given the floor is told that
    their voice is recorded.
- **Into the class's recordings:**
  - The file becomes a class recording with the source `live` (migration 0048).
  - It is unpublished until the teacher shares it, with the existing consent confirmation
    (story 8.3).
  - From there it takes the same path as an upload: transcode, transcript (EU or local),
    chapters and summary.
  - The class quota (50 GB) must have room for about 90 minutes before a recording starts.
- **Storage credentials stay on the egress server.** Its own S3 settings (a RustFS key that
  may only write under `recordings/` of the media bucket) say where files go. A start request
  carries only the object key.
- **The worker follows each recording.** It checks the egress every 30 seconds:
  - A stored file (confirmed in the object store, not just reported) goes to the transcode.
  - A failed egress marks the recording failed, with the reason.
  - A recording still running after its session ended (by time, or the room was left open) is
    stopped.
  - Every check stamps the recording. Every 5 minutes the worker follows again each recording
    nobody has checked on for 3 minutes: its check was lost, for example on a worker that
    lacked the recording settings, or after the queue gave up on it. Moving a stored recording
    on to the transcode is a single conditional update, so two checks meeting queue it once.
- **Off until configured:** recording needs live lessons, object storage and
  `SUFFA_LIVE_RECORDING_TEMPLATE_URL`. Without them the room offers no recording and says
  nothing about one.

## Consequences

- Two more apps to run: `suffa-egress` (`livekit/egress`, pinned) and `suffa-redis`, through
  which LiveKit and Egress talk (runbook §12a). `suffa-live` gets `REDIS_HOST`.
- Load: one recording runs a headless Chrome and an encoder. Plan about 2 CPU cores and
  1.5 GB of memory while it records. Several classes recording at once want a separate media
  server.
- A lesson of an hour at 720p is about 0.5–1.5 GB before the transcode, within the class
  quota.
- The browser test (`E2E_EGRESS=1`) runs the whole path against a local LiveKit, Egress, S3
  and worker: start, the badge for the learner, stop, stored, transcoded and listed.
- The push reminder before a session (stage 3 of ADR-0026) is still to come.
