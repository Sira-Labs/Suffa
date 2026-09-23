<p align="center">
  <img src="docs/assets/suffa-banner.svg" alt="Suffa — الصُّفَّة · Learn Arabic together: with your teacher, your class and an AI tutor." width="100%">
</p>

<p align="center">
  <b>Offline-first Arabic learning platform</b> for Modern Standard Arabic (فصحى), built around
  <i>Al-Arabiyya bayna Yadayk</i> (العربية بين يديك).<br>
  Spaced repetition · roots &amp; patterns · full tashkīl · classes · daily &amp; weekly achievements
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
platform, and the eight-pointed star of Islamic geometry.

## Screenshots

<table>
  <tr>
    <td width="58%"><img src="docs/assets/screenshot-dashboard.png" alt="Dashboard with due cards, streak, mastery and forgetting curve"></td>
    <td width="21%"><img src="docs/assets/screenshot-vocab-mobile.png" alt="Vocabulary trainer on a phone, fully vocalised"></td>
    <td width="21%"><img src="docs/assets/screenshot-roots-mobile.png" alt="Root explorer on a phone"></td>
  </tr>
  <tr>
    <td align="center"><sub>Dashboard: what's due, streak, mastery</sub></td>
    <td align="center"><sub>Vocabulary with tashkīl levels</sub></td>
    <td align="center"><sub>Root &amp; pattern explorer</sub></td>
  </tr>
</table>

## What you can do today

| Module                      | What it does                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 📊 **Dashboard**            | Due cards, streak, mastery, forgetting curve, heat-map and "what next".                                     |
| 🗂️ **Vocabulary (SRS)**     | Active recall AR→DE / DE→AR, plurals, root→word, nisba. SM-2 scheduling with leech detection (ADR-0001).    |
| 🌳 **Roots (الجذر والوزن)** | Every word linked to its root and pattern; "same root?" drills.                                             |
| 📖 **Reading**              | Vocalised dialogues with tap-a-word glosses; translation on demand.                                         |
| ✍️ **Writing**              | Dictation and translation with character-level feedback, tolerant of missing tashkīl.                       |
| 🎤 **Speaking**             | Shadowing, recording and minimal-pair drills (ع/ء, ح/ه, ق/ك …).                                             |
| 🔄 **Conjugation**          | Past, present and imperative tables across all persons.                                                     |
| 🎯 **Exams**                | Interleaved, mixed-chapter, speed and adaptive formats; wrong answers become due cards.                     |
| 🎬 **Library**              | Embedded video lessons and the official audio.                                                              |
| 🔁 **Sync**                 | Offline-first on each device (IndexedDB), with an outbox and last-write-wins sync across phone and desktop. |

The interface is in **German**; learning content is MSA with full vocalisation.

## Where it's going

| Phase                      | When (plan)     | Highlights                                                                       |
| -------------------------- | --------------- | -------------------------------------------------------------------------------- |
| Foundation                 | Oct 2026        | Own API on CapRover, CI, backups                                                 |
| Accounts, roles & classes  | Nov 2026        | Student / teacher / admin, invite links, admin panel                             |
| Engagement                 | Dec 2026        | Daily quests, XP, streak shields, badges, class weekly challenges, reminders     |
| **Teacher pilot**          | **Jan 4, 2027** | First real class                                                                 |
| Teacher recordings         | Jan 2027        | Google Drive import, transcripts, interactive checkpoints, offline audio         |
| AI teacher **al-Muʿallim** | Feb–Mar 2027    | Explain, converse, drill and grade; Anthropic, OpenRouter or Hugging Face models |
| Interactive YouTube        | Mar 2027        | Muhammad al-Andalusi's lessons with checkpoints                                  |
| iOS & Android apps         | Apr 2027        | Capacitor apps, native reminders and push                                        |

Details: [roadmap](docs/plan/roadmap.md) · [sprint plan](docs/plan/sprint-plan.md) ·
[engagement plan](docs/plan/engagement-plan.md) · [cost plan](docs/plan/cost-plan.md).

## Architecture

```mermaid
flowchart LR
  subgraph Device["Phone / desktop — works offline"]
    PWA[Suffa PWA] --> IDB[(IndexedDB)]
  end
  subgraph CapRover
    Web["suffa-web<br/>Caddy + PWA"] --> API[suffa-api]
    Worker[suffa-worker] --> DB[(suffa-db<br/>Postgres 17)]
    API --> DB
    Web --> RustFS[(RustFS)]
  end
  PWA -- "HTTPS, same origin" --> Web
```

The device is the source of truth for learning data; the server owns identity, classes,
shared content and AI. Full design: [technical spec](docs/spec/02-technical-spec.md) and
[ADRs](docs/README.md#architecture-decision-records).

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

The app works immediately without any backend (offline mode). Useful scripts:

| Command             | Purpose                                  |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Dev server                               |
| `npm run build`     | Typecheck + production build (incl. PWA) |
| `npm run preview`   | Serve the build locally (test the PWA)   |
| `npm run lint`      | ESLint                                   |
| `npm run typecheck` | TypeScript                               |
| `npm test`          | Vitest                                   |
| `npm run format`    | Prettier                                 |

API (skeleton: health, migrations, worker heartbeat):

```bash
cd apps/api && npm install
npm test
npm run build
SUFFA_DATABASE_URL=postgres://user:pass@localhost:5432/suffa npm start
```

## Deploy on CapRover

Suffa is deployed like Tabayyun: GitHub Actions build the images (`suffa-web`, `suffa-api`),
push them to GHCR, and CapRover runs them.

1. CapRover → **Apps → One-Click Apps/Databases → `>> TEMPLATE <<`**.
2. Paste [`infra/caprover/one-click/suffa.yml`](infra/caprover/one-click/suffa.yml) (web + db)
   or [`suffa-full.yml`](infra/caprover/one-click/suffa-full.yml) (db, api, worker, web).
3. Enter the app name **`suffa`**, then deploy.

The images are public on GHCR (`ghcr.io/thedatadudech/suffa-web`, `suffa-api`), so CapRover
needs no registry credentials.
Step-by-step guide, env vars and troubleshooting: [docs/ops/caprover-deployment.md](docs/ops/caprover-deployment.md).

## Device sync with Supabase (current)

Until the own API takes over (ADR-0007), sync uses Supabase:

1. Create a Supabase project; run `supabase/schema.sql`, then `supabase/policies.sql`.
2. Enable email magic links and allow your app URL as a redirect.
3. `cp .env.example .env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Sign in under **Einstellungen → Konto** on each device.

No secrets live in the code. The anon key is public by design; row-level security protects the data.

## Project structure

```
src/            PWA: modules (dashboard, vocab, roots, reading, writing, speaking,
                conjugation, exam, library, settings), services (srs, storage, sync,
                speech, audio), state, content (JSON per unit), types
apps/api/       suffa-api / suffa-worker (Hono, Postgres, migrations)
infra/          Dockerfiles, Caddyfile, CapRover templates
supabase/       schema + row-level security (current sync backend)
docs/           specs, ADRs, roadmap, sprint/engagement/cost plans, ops runbook
public/brand/   logo (SVG)
```

## Arabic fonts (offline)

For the best typography, put `amiri.woff2` and `scheherazade.woff2` into `public/fonts/`
(OFL licence, see `public/fonts/README.md`). Without them the app falls back to a system font.

## Contributing

- Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`).
- Before committing: `npm run lint && npm run typecheck && npm test` (and `npm test` in `apps/api`).
- Hard-to-reverse decisions get an ADR in `docs/adr/`.

## Licence

Code: MIT (see `LICENSE`). Content from _Al-Arabiyya bayna Yadayk_ is copyrighted by its
publishers; the seed data is for learning and demo purposes.
