<p align="center">
  <img src="docs/assets/suffa-banner.svg" alt="Suffa — الصُّفَّة · Learn Arabic together: with your teacher, your class and an AI tutor." width="100%">
</p>

<p align="center">
  <b>Offline-first Arabic learning app</b> for Modern Standard Arabic (فصحى).<br>
  16 units along the topics of Book 1 of <i>Al-Arabiyya bayna Yadayk</i>, with our own texts ·
  spaced repetition · roots &amp; patterns · full tashkīl
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#deploy-on-caprover">Deploy</a> ·
  <a href="docs/plan/roadmap.md">Roadmap</a> ·
  <a href="docs/README.md">Documentation</a>
</p>

---

## Why "Suffa"?

The **Ṣuffa (الصُّفَّة)** was the covered platform in the Prophet's ﷺ mosque in Madīna where the
_Ahl al-Ṣuffa_ lived and studied. It is often called the first residential school in Islam:
teachers and students sat together, learning never stopped, and anyone sincere could join.

Suffa brings that idea to learning Arabic: **students, their teacher and an AI assistant
teacher (al-Muʿallim) around one curriculum**, and it works even without internet.

The logo shows exactly that: a palm-frond roof on palm-trunk pillars, an open book on the
platform, and the eight-pointed star of Islamic geometry. It appears in the app header
(sidebar on desktop, top bar on phones), on the loading screen and as the PWA icon; the iOS and
Android apps will use the same mark.

## Screenshots

<table>
  <tr>
    <td width="60%"><img src="docs/assets/screenshot-home.png" alt="Heute: the current unit with its next step, today's path, word of the day with daily check-in"></td>
    <td width="20%"><img src="docs/assets/screenshot-unit-mobile.png" alt="A unit on a phone: dialogue 1 with its stations"></td>
    <td width="20%"><img src="docs/assets/screenshot-cloze-mobile.png" alt="Cloze exercise on a phone"></td>
  </tr>
  <tr>
    <td align="center"><sub>"Heute": your unit, today's path, word of the day</sub></td>
    <td align="center"><sub>One dialogue at a time</sub></td>
    <td align="center"><sub>Cloze from real sentences</sub></td>
  </tr>
</table>

## How it works

**Level 1 = Book 1, in two stages of eight units.** A learner starts a unit with a pace
(3, 2 or 1 weeks), works through it and unlocks the next unit with the unit test (≥ 80 %).
Each stage ends with a stage test, a badge and a milestone screen.

**A unit shows one dialogue at a time.** Each dialogue is a section with its own stations; later
sections stay closed until the current one is done, and a closing section holds the
publisher's exercises, the verbs and the unit test.

| Station in a section | What the learner does                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 🎧 Dialog hören      | The publisher's official audio for this dialogue (streamed from the publisher); page videos as an optional extra.      |
| 📖 Dialog lesen      | Our own vocalised dialogue with tap-a-word glosses and a comprehension question.                                       |
| 🌳 Grammatik         | One rule per dialogue: explanation, examples to listen to, two questions.                                              |
| 🗂️ Wörter lernen     | The dialogue's words as spaced-repetition cards (AR→DE, DE→AR), tolerant checking.                                     |
| 🧩 Lückentext        | Real example sentences with the word blanked out; pick it from four words of the unit.                                 |
| ✍️ Schreiben         | Five counted steps: copy, dictation, transliteration → script, sentence building, translation. Resumes where you left. |
| 🎤 Nachsprechen      | Shadowing and recording of the dialogue lines (optional).                                                              |

**Around the units**

| Area             | What it does                                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| ☀️ **Heute**     | Opens with your unit and its next step ("Fortsetzen"), today's path, word of the day with a daily check-in (+10 XP), level card, wobbly words.      |
| 🏋️ **Training**  | Review, vocabulary, roots (الجذر والوزن), conjugation and exams — only with the units you have reached, so nothing from later units shows up early. |
| 🔤 **Alphabet**  | For absolute beginners: the 28 letters in eight lessons with forms, sounds, example words and a two-way quiz.                                       |
| 🧭 **Entdecken** | A curated library of YouTube videos and podcasts on Arabic and the Quran; started videos are pinned to "Weiterschauen" until seen or unpinned.      |
| ⭐ **XP**        | Points for reviews, heard tracks, practised items, the daily check-in, units finished on time and stages; shown the moment you earn them.           |
| 🎯 **Quests**    | Three daily quests, streak with shields, weekly goal (3/5/7 days), badges and levels; checked again on the server so they cannot be faked.          |
| 🔁 **Sync**      | Offline-first on each device (IndexedDB) with an outbox; everything syncs through the own API once signed in, on phone and computer alike.          |

**With a class and a teacher**

| Area                 | What it does                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 👥 **Classes**       | Teachers create a class and invite with a link or QR code; they approve who joins. Class page with activity, mastery per unit and problem words.     |
| 🏆 **Class spirit**  | Weekly class challenge, teacher badges and shout-outs, an opt-in weekly league (off for classes of minors), unit certificates, a live class quiz.    |
| 🎙️ **Recordings**    | The teacher's lessons from Google Drive or upload: transcoded, transcribed, with chapters and checkpoints, playable offline; assignments with dates. |
| 📺 **Video lessons** | YouTube lessons in the same player with checkpoints and, where permitted, a transcript with tap-to-gloss.                                            |
| 🤖 **al-Muʿallim**   | An AI assistant teacher that explains, converses, drills and grades along the curriculum; mistakes become review cards; the teacher can override.    |
| 🔔 **Reminders**     | One reminder a day at the chosen time (web push or the app), never in quiet hours, skipped when today's quest is done; a weekly recap on Sundays.    |

The interface is in **German**; learning content is MSA with full vocalisation.

## Content and rights

- **Own texts.** Word lists (401), dialogues (48) and verbs (51) for all 16 units are written
  for Suffa along the topics of Book 1. No text from the book is in this repository. They are
  drafts (`status: "entwurf"`) until a teacher has reviewed them.
- **Example sentences** (471) come from [Tatoeba](https://tatoeba.org) (CC BY 2.0 FR, with
  attribution per sentence) or were written for Suffa.
- **Publisher media.** The official audio and the page videos of _Al-Arabiyya bayna Yadayk_ are
  only linked and played from the publisher's servers and YouTube; nothing is copied.
- **Entdecken** embeds YouTube videos with the no-cookie player; they belong to their channels.

## Where it's going

| Phase                        | Status                  | Highlights                                                                             |
| ---------------------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| Learning experience          | ✅ built                | Unit room, focused sections, guided writing, cloze, grammar, alphabet, levels & stages |
| Foundation                   | ✅ built                | Own API on CapRover, CI, backups, error tracking, staging → production promotion       |
| Accounts, roles & classes    | ✅ built                | Link, code or passkey sign-in; student / teacher / admin; invite links; admin panel    |
| Engagement                   | ✅ built                | Daily quests, streak shields, class challenges, reminders, weekly recap                |
| Teacher recordings           | ✅ built                | Google Drive import, transcripts, interactive checkpoints, offline audio, assignments  |
| AI teacher **al-Muʿallim**   | ✅ built                | Explain, converse, drill and grade; Anthropic, OpenRouter or Hugging Face models       |
| Interactive YouTube          | ✅ built                | Video lessons with checkpoints and transcripts                                         |
| iOS & Android apps           | ◐ built, stores open    | Capacitor apps, native reminders and push; store release after device tests            |
| Pronunciation, FSRS, English | ▶ week of Sep 28        | Own recordings scored and shared with the teacher, FSRS, content CMS, English UI       |
| Own production server        | ▶ when the server is up | Separate production with point-in-time backups (ADR-0024)                              |
| **Teacher pilot**            | **Jan 4, 2027**         | First real class                                                                       |

Details: [roadmap](docs/plan/roadmap.md) · [sprint plan](docs/plan/sprint-plan.md) ·
[engagement plan](docs/plan/engagement-plan.md) · [content plan](docs/plan/content-plan.md) ·
[cost plan](docs/plan/cost-plan.md).

## Architecture

```mermaid
flowchart LR
  subgraph Device["Phone / desktop — works offline"]
    PWA["Suffa PWA<br/>(or the iOS/Android app)"] --> IDB[(IndexedDB)]
  end
  subgraph Prod["Production CapRover"]
    Web["suffa-web<br/>Caddy + PWA"] --> API[suffa-api]
    Worker["suffa-worker<br/>jobs, transcode, push"] --> DB[(suffa-db<br/>Postgres 17)]
    API --> DB
    API --> RustFS[(RustFS<br/>media)]
    Worker --> RustFS
  end
  subgraph Tools["Staging + tools CapRover"]
    Staging[staging apps]
    GlitchTip[GlitchTip]
  end
  PWA -- "HTTPS, same origin" --> Web
  API -. "LLM, STT" .-> AI[(Anthropic / OpenRouter /<br/>Hugging Face)]
  Prod -. errors .-> GlitchTip
```

The device is the source of truth for learning data; the server owns identity, classes,
shared content and AI. Full design: [technical spec](docs/spec/02-technical-spec.md) and
[ADRs](docs/README.md#architecture-decision-records).

## Quick start

```bash
npm install          # installs both workspaces (apps/web, apps/api) from one lockfile
npm run dev          # http://localhost:5173
```

The app works immediately without any backend (offline mode). Scripts at the repository root
run across both workspaces:

| Command             | Purpose                                  |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Dev server                               |
| `npm run build`     | Typecheck + production build (PWA + api) |
| `npm run preview`   | Serve the build locally (test the PWA)   |
| `npm run lint`      | ESLint                                   |
| `npm run typecheck` | TypeScript                               |
| `npm test`          | Vitest (web + api) and the content tools |
| `npm run format`    | Prettier                                 |

API (health, migrations, sync endpoints, job queue on pg-boss):

```bash
npm test -w @suffa/api                      # Postgres tests run with SUFFA_TEST_DATABASE_URL
npm run build -w @suffa/api
SUFFA_DATABASE_URL=postgres://user:pass@localhost:5432/suffa npm start -w @suffa/api
```

Browser tests (Playwright, desktop and phone) against the built app and API on a throwaway
database:

```bash
npm run build -w @suffa/api && npm run build -w @suffa/web
E2E_DATABASE_URL=postgres://…/suffa_e2e npm run e2e -w @suffa/e2e
```

## Deploy on CapRover

Suffa is deployed like Tabayyun: GitHub Actions build the images (`suffa-web`, `suffa-api`),
push them to GHCR, and CapRover runs them.

1. CapRover → **Apps → One-Click Apps/Databases → `>> TEMPLATE <<`**.
2. Paste [`infra/caprover/one-click/suffa.yml`](infra/caprover/one-click/suffa.yml) (web + db)
   or [`suffa-full.yml`](infra/caprover/one-click/suffa-full.yml) (db, api, worker, web).
3. Enter the app name **`suffa`**, then deploy.

The images are public on GHCR (`ghcr.io/sira-labs/suffa-web`, `suffa-api`), so CapRover
needs no registry credentials.
Optional: [`suffa-backup.yml`](infra/caprover/one-click/suffa-backup.yml) (nightly verified
backups to RustFS) and [`glitchtip.yml`](infra/caprover/one-click/glitchtip.yml) (error tracking
and uptime checks, no Redis).
**Releases:** every push to `main` builds the images once, scans them, and deploys them by
digest to **staging**. **Production** runs on its own server and gets exactly those digests
after the owner approves the release in GitHub (ADR-0024); a rollback goes through the same
approval.

Step-by-step guide, env vars and troubleshooting: [docs/ops/caprover-deployment.md](docs/ops/caprover-deployment.md).

## Sign-in and device sync

Learners sign in **without a password** (ADR-0008): they enter their email and get a mail
with a link and a six-digit code. The link signs in the device that opens it; the code signs in
any browser it is typed into (for mail apps that open links in their own browser). Once signed
in, a learner can add a **passkey** in the settings and from then on sign in with Face ID,
Touch ID or the device PIN. The session is an httpOnly cookie (the apps keep a token in the
Keychain/Keystore). Learning data then syncs through the own API (`/api/v1/sync`),
offline-first as before.

- **Server:** set `SUFFA_AUTH_SECRET`, `SUFFA_PUBLIC_URL` and the SMTP variables on `suffa-api`
  (the Google Workspace SMTP relay, as for Tabayyun) — see
  [docs/ops/caprover-deployment.md](docs/ops/caprover-deployment.md#sign-in-mails-magic-link).
  Without SMTP the api runs and the app stays in offline mode.
- **Locally:** start Postgres and the api (`SUFFA_ENV=dev`, no SMTP needed: the sign-in link is
  written to the api log), then `npm run dev`; Vite proxies `/api` to `SUFFA_API_URL`
  (default `http://localhost:8000`).
- **Offline build:** `VITE_SYNC_BACKEND=off` builds the app without sync; see `.env.example`.

No secrets live in the code; they are set as environment variables only.

## Project structure

```
apps/web/        PWA (@suffa/web)
  src/modules/   dashboard (Heute), units, alphabet, grammar, discover, library, review, vocab,
                 roots, reading, cloze, writing, speaking, conjugation, exam, classes (incl.
                 recordings), videos, tutor, engagement, account, settings, admin
  src/services/  srs, units & practice, enrollment, engagement, sync, passkeys, speech,
                 audio, video, storage (Dexie)
  src/native/    bridge for the iOS/Android shell (token storage, deep links, push)
  src/content/   units/einheit-NN.json (own texts), meta.json, sources/
apps/api/        suffa-api / suffa-worker (@suffa/api: Hono, Better Auth, Postgres, pg-boss)
  migrations/    plain SQL migrations
apps/e2e/        Playwright browser tests (desktop + phone)
packages/engagement/  XP, quests, streak, badges, levels (shared by app and server)
packages/llm/    LLM providers (Anthropic, OpenRouter, Hugging Face) behind one interface
mobile/          Capacitor configuration for the iOS and Android apps
tools/content/   scripts that build the video index and find Tatoeba examples
infra/           Dockerfiles, Caddyfile, CapRover templates
docs/            specs, ADRs, roadmap, sprint/engagement/content/cost plans, ops runbook
```

## Fonts

All fonts ship with the app (offline, no CDN): Manrope (UI), Fraunces (headings), Amiri
(Arabic text with full tashkīl) and Reem Kufi (Arabic display), all under the SIL Open Font
License, bundled via `@fontsource`. See `apps/web/src/styles/fonts.css`.

## Contributing

- Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`).
- Before committing: `npm run format:check && npm run lint && npm run typecheck && npm test`.
- Hard-to-reverse decisions get an ADR in `docs/adr/`.
- **Language:** everything in the repository is English (code, comments, logs, tests, docs,
  commits). Text that learners see in the app is German, and learning content keeps its German
  meanings; UI texts move into an i18n catalog with ADR-0021.

## Licence

Code: MIT (see `LICENSE`). Own learning texts are drafts written for Suffa; example sentences
from Tatoeba are under CC BY 2.0 FR. _Al-Arabiyya bayna Yadayk_ and its audio and videos are
copyrighted by their publisher; Suffa only links to them.
