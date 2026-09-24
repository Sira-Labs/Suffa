# 01 — Product Specification: **Suffa** (الصُّفَّة)

- Status: draft v2 · Date: 2026-09-24 · Owner: Markus
- Related: `00-codebase-analysis.md`, `02-technical-spec.md`, ADR-0005 … ADR-0020,
  `plan/engagement-plan.md`, `ops/caprover-deployment.md`

## 1. Name

**Suffa — الصُّفَّة** · _"Arabic, learned together, the way it was learned in the Suffa."_

In the Sīra, **the Ṣuffa** was the covered platform at the rear of the Prophet's ﷺ mosque in
Madīna. The **Ahl al-Ṣuffa** — among them Abū Hurayra — lived and studied there, and it is often
called the first residential school in Islam: a place where teachers and students sat together,
learning was continuous, and anyone sincere could join. That is exactly the product: a place
where students, teachers and an AI assistant-teacher sit together around one curriculum.

- **AI teacher persona:** **"al-Muʿallim" (المُعَلِّم, "the teacher")**. We deliberately do
  **not** name the AI after a Companion (e.g. Muṣʿab ibn ʿUmayr, Zayd ibn Thābit) — attributing
  machine-generated words to a revered person would be disrespectful and misleading.
- Alternatives considered: _Dār al-Arqam_ (first teaching house in Makka — strong, but longer
  and harder to brand), _Zayd_ (Zayd ibn Thābit learned a new script in ~17 days — great story,
  rejected for the reason above). Decision recorded in ADR-0005.

## 2. Vision

> Turn a solo flash-card PWA into a **complete, self-hosted Arabic learning platform** where an
> AI teacher tutors every student 1:1, human teachers steer classes, and curated video lessons
> (starting with Muhammad al-Andalusi) become interactive lessons tied to spaced repetition.

### Goals (12 months)

| Goal                           | Metric                                             | Target                               |
| ------------------------------ | -------------------------------------------------- | ------------------------------------ |
| Learners practise daily        | D7 retention / median streak                       | ≥ 40 % / ≥ 5 days                    |
| Pilot class is engaged         | Weekly active / enrolled; daily quest completion   | ≥ 70 % / ≥ 60 % (engagement plan §8) |
| AI teacher is genuinely useful | 👍 rate on tutor turns; teacher-audited accuracy   | ≥ 85 % / ≥ 95 % correct Arabic       |
| Teachers save time             | Assignments created per teacher/week; grading time | ≥ 2 / −50 % vs manual                |
| Sustainable cost               | AI cost per active learner/month                   | ≤ €3 (see `plan/cost-plan.md`)       |
| Sovereign & reliable           | Uptime on CapRover; data self-hosted               | ≥ 99.5 %; 100 %                      |

### Non-goals (v1)

Separate native codebases (Swift/Kotlin) — the app-store apps wrap the PWA with Capacitor (F10),
payments/subscriptions, public marketplace for third-party courses, dialect curricula beyond
optional Gulf notes, issuing religious rulings.

## 3. Personas and roles

**First real users:** a teacher Markus knows will run Suffa with his class (pilot from
2027-01-04, see `plan/engagement-plan.md` §7). His needs — classes, daily/weekly achievements,
reminders and his Google Drive session recordings — drive the order of the roadmap.

| Role                      | Who                          | Can do                                                                                                                                                                                                                                                        |
| ------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Student** (`student`)   | Self-learner or class member | Learn offline, chat with al-Muʿallim, watch interactive lessons, do assignments, see own progress.                                                                                                                                                            |
| **Teacher** (`teacher`)   | Runs one or more classes     | Create classes & invite codes, import session recordings from Google Drive, set weekly class challenges and award badges, assign units/videos/exams, see class progress & leech words, review AI-graded work, author content drafts, set AI limits per class. |
| **Admin** (`admin`) — you | Platform owner               | Everything: users & roles, content publishing, video catalog, AI provider/model routing, quotas & budgets, audit log, system health.                                                                                                                          |
| **Guest**                 | Not signed in                | Full offline app with bundled content (today's behaviour). No AI, no sync.                                                                                                                                                                                    |

A user has exactly one **platform role** plus **class memberships** (a teacher in class A can be
a student in class B — modelled as class-level role, see ADR-0009).

## 4. Feature specification

### F1 — Accounts & authentication _(Must)_

- Sign-up / sign-in via **email magic link**, **email + password**, **passkeys**; optional Google.
- Email verification; password reset; session list with "sign out other devices".
- Join a class by **invite code / link**; teacher approval optional.
- Account deletion & data export (GDPR Art. 15/17/20).
- **Acceptance:** a user signed in on phone and desktop sees the same SRS state within one sync
  cycle; revoked sessions are rejected within 60 s.

### F2 — Admin panel _(Must)_

Route `/admin` (role-gated, server-enforced). Sections:

1. **Users** — search, paginate, change role, disable, impersonate-read-only, reset sessions.
2. **Classes** — list, transfer ownership, archive.
3. **Content** — units, vocab, dialogues, verbs; draft → review → publish workflow; publish
   bumps `contentVersion` and rebuilds the offline bundle.
4. **Media catalog** — YouTube channels/playlists and teacher recordings, segments, checkpoints, storage usage (F5, F8).
5. **AI** — providers (Anthropic / OpenRouter / Hugging Face), model per task, prompt versions,
   global and per-role quotas, spend dashboard, flagged conversations.
6. **Audit log** — who changed what (roles, content, AI config).
7. **System** — health checks, queue depth, backups status, feature flags.

### F3 — Teacher workspace _(Must)_

- Class dashboard: members, activity heat-map, mastery per unit, top leech words.
- **Assignments**: pick units / exam formats / videos / AI conversation scenarios, due date.
- **Review queue**: AI-graded writing and speaking with the AI's rationale; teacher can
  override grade and add a comment (overrides are fed back as eval data).
- Content drafts: propose vocab, dialogues, video checkpoints (admin publishes).
- Per-class AI settings: allowed features, daily turn limit, "Arabic-only replies" mode.

### F4 — al-Muʿallim, the AI teacher _(Must)_

Server-side, streaming, grounded in the curriculum and the learner's SRS state.

| Mode         | What it does                                                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Explain**  | Explain a word, root, pattern (wazn), grammar point from the current unit, in German (or English), with fully vocalised Arabic examples. |
| **Converse** | Role-play dialogues at the learner's level (i+1): at the souq, at the airport, meeting a colleague. Corrections are gentle and inline.   |
| **Drill**    | Generate fresh exercises (cloze, translation, conjugation, root families) from **known + due** vocabulary.                               |
| **Grade**    | Grade free-text writing and transcribed speech with rubric + error categories; mistakes become SRS cards.                                |
| **Coach**    | Weekly plan: "you forget broken plurals — here's a 10-minute plan".                                                                      |

Rules: MSA only (dialect notes only when enabled); always offer vocalised text; tashkīl level
follows the user setting; never issue religious rulings (fatwa) — refer to a qualified scholar;
respectful tone; content filters for minors (classes can be marked `minors`).
**Acceptance:** first token < 1.5 s p50; every Arabic string in structured outputs passes the
tashkīl validator; tutor cannot read another user's data (tool-level authorisation tests).

### F5 — Interactive video lessons (Muhammad al-Andalusi first) _(Must)_

- Admin imports a **YouTube channel / playlist** (Data API v3) → videos land in the catalog
  with title, duration, thumbnails. Channel ID is configuration, not code.
- Admin/teacher maps each video to a **unit** and defines **segments** (start/end) and
  **checkpoints** at timestamps: MCQ, "type what you heard", "repeat after me", vocab flash.
- Player built on the **YouTube IFrame Player API**: pauses at checkpoints, shows the
  exercise, resumes; replay-segment and 0.75× speed buttons.
- **Transcript pane** (where captions are available/licensed): tap a word → gloss + "add to SRS".
- "Ask al-Muʿallim about this minute" — sends segment transcript + timestamp as context.
- Progress per video (watched %, checkpoint score) syncs like other learning data.
- **Content rights:** embedding uses YouTube's standard embed (allowed by YouTube ToS). We do
  **not** download or re-host videos. We will **ask Muhammad al-Andalusi for permission** before
  using transcripts beyond auto-captions and before featuring the channel by name in marketing.
- Offline: catalog, checkpoints and transcripts are cached; the video itself needs a network.

### F6 — Learning core upgrades _(Should)_

- **FSRS** scheduler behind the existing `schedule()` interface (ADR-0001 already anticipates it).
- **Pronunciation assessment** with Arabic speech models: letter-level feedback on the
  sounds learners struggle with (ع ح ق ص ض ط ظ, hamza, vowel length, shadda), chosen by an
  evaluation against teacher ratings (ADR-0015, ADR-0022).
- Content growth: all 16 units of Book 1, then Book 2; audio per vocab item.
- Languages: separate settings for UI, tutoring and meaning language — German (today),
  English, later Arabic UI with RTL chrome (ADR-0021).
- **Tolerant answer checking** (shipped 2026-09-23): any one of several meanings counts
  („Ort“ for بَلَد = „Land, Ort“), optional parts, articles, umlaut spellings and small typos
  are accepted; the other meanings are shown after answering.

### F7 — Engagement: daily & weekly achievements _(Must — pilot)_

Full design in `plan/engagement-plan.md`, decision in ADR-0016.

- **Daily:** 3 personalised quests (review · learn · produce) + bonus; XP; daily streak in the
  learner's time zone with earnable streak shields; "Today" card; reminder at a chosen time.
- **Weekly:** personal weekly goal (3/5/7 days) and weekly streak; **class weekly challenge**
  (cooperative) set by the teacher; weekly recap; opt-in league ranked by % of goal (S14).
- **Achievements:** ~30 badges in tiers (consistency, vocabulary, roots, grammar, writing,
  speaking, listening, exams, class spirit, seasonal), teacher-created custom badges, unit
  certificates. Badges are never lost.
- **Teacher tools:** class dashboard, challenge templates, shout-outs, announcements.
- **Guardrails:** no chance-based rewards, nothing purchasable, leaderboards off for minors by
  default, max 1 reminder/day, learning-quality guardrail metric.
- **Acceptance:** quests/XP update instantly offline; server values reconcile after sync; a
  missed day with a shield keeps the streak; teacher sees class quest completion by next sync.

### F8 — Teacher session recordings from Google Drive _(Must — pilot)_

Decision in ADR-0018; storage in ADR-0017.

- Teacher connects Google Drive (`drive.file` + Picker) and picks recordings; or uploads
  directly (resumable). Files are copied into Suffa's storage (shared **RustFS**).
- Automatic processing: audio-only + 720p versions, transcript (Whisper), AI suggestions for
  chapters/vocab/checkpoints — **published only after teacher review** and consent confirmation.
- Students watch/listen in the interactive player (same as F5): checkpoints, transcript
  tap-to-gloss, add-to-SRS, "ask al-Muʿallim about this minute", **offline audio download**.
- Recording lessons generate daily quests ("Listen to Tuesday's session and pass 3 checkpoints").
- **Acceptance:** a 1-hour recording is playable (audio) within 30 min of import; non-members get
  403; teacher can delete a recording and all derived data.

### F9 — Assignments _(Must)_

Units, exam formats, recordings, videos and (later) tutor scenarios with due dates; appear as
class quests; submissions with AI grade + teacher override (grading from S11).

### F10 — iOS & Android apps _(Should)_

Decision in ADR-0019. Capacitor wrapper of the same build; on-device daily reminders
(offline), push for teacher announcements and recaps, offline audio with background playback,
join-class deep links. Store release target: April 2027.

## 5. Non-functional requirements

| Area          | Requirement                                                                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offline       | All non-AI features work offline; AI/video show a clear "needs connection" state.                                                                              |
| Performance   | LCP < 2.5 s on mid-range Android, 4G; API p95 < 300 ms (non-AI).                                                                                               |
| Security      | OWASP ASVS L2; server-side authz on every endpoint; secrets only in CapRover env; CSP; rate limits.                                                            |
| Privacy       | GDPR: EU hosting, DPA with LLM providers, data minimisation (no PII in prompts beyond first name), retention: AI transcripts 90 days by default, configurable. |
| Accessibility | WCAG 2.2 AA; Arabic font scaling; RTL correctness.                                                                                                             |
| Reliability   | Nightly Postgres backups off-box, restore drill monthly; 99.5 % uptime.                                                                                        |
| Cost          | Hard monthly AI budget with automatic downgrade to cheaper models, then read-only.                                                                             |
| Observability | Structured logs, error tracking, per-request AI token/cost metering.                                                                                           |

## 6. Out-of-scope risks we accept

- YouTube can change embed rules or remove videos → catalog marks videos `unavailable`,
  checkpoints are preserved.
- LLM providers change prices/models → routing is configuration (ADR-0010).
