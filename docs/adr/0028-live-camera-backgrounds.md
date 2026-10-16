# ADR-0028: The teacher beside the shared screen, and camera backgrounds

- Status: accepted (owner, 16 Oct 2026)
- Date: 2026-10-16

## Context

Teacher feedback on the live room (ADR-0026). While sharing the screen, the teacher drops out
of the picture, and learners miss their face. Teachers and learners also want to show
something calmer than their room behind them, ideally with Muslim motifs. Pictures and sound
from the room must stay in the EU and on our servers. Nothing may go to a US provider, and no
CDN should learn who joins a lesson.

## Decision

- **Camera in the corner.** If the teacher shares the screen with the camera on, the screen
  fills the stage and the camera sits small in the corner. Every viewer can hide or show it
  for themselves. The teacher decides whether to be seen by switching the camera on or off.
  Nothing changes on the server.
- **Backgrounds in the browser.** Whoever may use the camera can choose between none, blur, or
  one of four pictures: stars (khatam pattern), arches, a mosque at dusk, and a mashrabiya.
  The choice is kept per device. `@livekit/track-processors` (pinned at 0.8.1) cuts the person
  out with MediaPipe's selfie segmenter, on the camera track before it is published. Only the
  finished picture leaves the device.
- **Our own files only.** The pictures are our drawings, generated as SVG by
  `tools/live-backgrounds` and shipped as JPEG. They contain no photos, no calligraphy and no
  third-party artwork. The model (`selfie_segmenter.tflite`, Apache-2.0, 250 kB) is
  committed under `public/live/mediapipe/`. Vite copies the MediaPipe WASM out of
  `node_modules` into the build, and the processor is told to load both from there. The
  library, the WASM (about 19 MB) and the pictures load only when someone picks a background.
  They are not precached.
- **CSP.** `script-src` adds `'wasm-unsafe-eval'`, which allows WebAssembly compilation and
  nothing else (no `eval`). `worker-src` adds `blob:` for the library's frame-timer worker.
- **Where it cannot run** — without WebGL 2, `OffscreenCanvas` or `VideoFrame`, as in older
  Safari — the picker is not shown, and the camera works as before.

## Consequences

- The web image grows by about 20 MB, but only people who use a background download it.
- Processing costs CPU and GPU on the device. Weak phones may lower their frame rate, and
  "none" stays the default.
- Background updates come with a version bump of `@livekit/track-processors` and
  `@mediapipe/tasks-vision`. The copy step picks up the WASM of the installed version.
- A new picture is a new design in `tools/live-backgrounds/designs.mjs`, plus a run of
  `node tools/live-backgrounds/render.mjs`.
