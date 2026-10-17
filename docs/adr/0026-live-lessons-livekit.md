# ADR-0026: Live lessons in the class, on our own LiveKit server

- Status: accepted (owner, 13 Oct 2026)
- Date: 2026-10-13

## Context

Teachers want to teach a class live: speak with camera, show the Medina book or their screen,
let learners ask by voice and in a chat. Today they send a Zoom or Jitsi link outside Suffa.
Jitsi works but is heavy for learners: its own page, room names, many buttons, and it knows
nothing about the class. Some classes also meet as sisters' and brothers' groups apart.

Constraints that already hold in Suffa:

- Recordings and transcripts of learners go to no US provider (ADR-0018, runbook §11). Live
  audio and video of learners, many of them minors, fall under the same rule.
- One small server per environment (ADR-0024), CapRover, Caddy in front of the web app.
- The live quiz (story 14.4) shows the class flow: the teacher opens it, learners see a banner
  in their class and join with their account.

## Decision

- **LiveKit, self-hosted, as the media server.** It is open source (Apache-2.0), a single Go
  binary or image, and an SFU: each participant sends one stream, the server forwards it. We
  run it as a CapRover app next to `suffa-api` (`suffa-live`), no cloud service.
  - Rejected: **Jitsi** (heavy UI of its own, several services), **BigBlueButton** (needs its
    own big server), **peer-to-peer WebRTC** (breaks down beyond four people), **hosted video
    APIs** (US providers, data leaves our servers).
- **Suffa owns the room UI.** The web app connects with `livekit-client` and draws its own
  small room: the teacher large, the learners as a strip, a chat, raised hands. No room names
  or passwords: learners join from their class with their Suffa account.
- **The API decides who may join and what they may do.** It signs a short-lived LiveKit
  token (LiveKit API key and secret stay on the server) only for active members of the class,
  only while the session is live:
  - the class teacher (or an admin) may publish camera, microphone and screen, and moderate;
  - learners join listening and may write in the chat and raise a hand; the teacher gives
    them the floor (microphone, camera) through the API, which updates their permission on
    the LiveKit server, and takes it back the same way.
- **Live sessions are planned in the class** (`live_sessions`): title, start, length; the
  teacher starts and ends them. At most one session per audience of a class is live at a time
  (everyone, the sisters, the brothers; stage 2), so the two groups can meet in parallel.
  Every change is audit-logged.
- **Nothing of the room is stored in stage 1:** no chat history, no recording. Chat messages
  travel only through the room. Recording comes later, into the class's recordings, only when
  the teacher turns it on for a session and with the same EU-only rule.
- **The feature is off until configured.** Without `SUFFA_LIVEKIT_URL`, `SUFFA_LIVEKIT_API_KEY`
  and `SUFFA_LIVEKIT_API_SECRET` the API says so and the web app shows no live sessions.

## Stages

1. Plan, start and join live sessions; sound and picture, screen sharing, raised hands with
   the teacher giving the floor, chat.
2. Sisters' and brothers' sessions: the teacher puts each learner with the sisters or the
   brothers (members tab, audit-logged); a session is for everyone, the sisters or the
   brothers. Learners see and join only sessions for everyone and for their own section (a
   learner without a section: everyone's only); the teacher sees and leads all. One session
   per audience is live at a time, so the two groups can meet in parallel. An option keeps
   learners' cameras off: the floor then grants the microphone only, enforced by LiveKit.
3. Recording into the class's recordings (transcript, chapters, "ask about this minute"), and
   a push reminder before a session starts.
4. Invite links to one session (update 2026-10-17): the teacher shows a link with its QR code
   for a planned or live session. It holds while the session is listed (a planned one until
   its end plus 12 hours, a live one until its end plus the hour of overrun); a new link
   replaces the session's old one, and the class's own invite link stays as it is. Opening
   it, a member of the class goes to the session; anyone else asks to join the class (pending,
   as with the class link) and comes in through the same link once the teacher approves. It
   grants no guest access: only members get a room token, and sisters' or brothers' sessions
   still check the learner's section. Only the token's SHA-256 is stored, and error reports
   name the page without it.

## Consequences

- One more app to run, with ports for media: TCP 7881 and UDP 7882 must be open on the server
  (runbook §12). Behind strict networks that block UDP, media falls back to TCP 7881.
- The page's Content Security Policy allows the LiveKit host, and the Permissions Policy
  allows camera and screen sharing for our own origin.
- Load: an SFU forwards, it does not mix. A class of 30 with one teacher video is light for
  the current server; many parallel classes or recording would want a separate media server.
