# Suffa — Roadmap

- Date: 2026-09-24 (v2: re-sequenced for the teacher pilot) · Cadence: 2-week sprints ·
  Sprint 1 starts **Mon 2026-10-05**
- Capacity assumption: 1 full-time developer (plus AI coding assistants) + product owner (you)
  ≈ 20 story points/sprint. With part-time capacity, stretch dates proportionally; the order stays.

## Where we are (2026-09-24)

**P0 Foundation is almost done before its planned start:** 11 of 12 stories shipped
(Sprints 1–2 were planned for Oct 5 – Nov 1). Live on CapRover: web, api, worker, database,
nightly verified backups (restore drill passed), job queue, error tracking. Open in P0: 2.6
browser router. **Gate G0 is met.** The dates below are unchanged on purpose: the lead is
buffer for the pilot on Jan 4; P1 (accounts, roles, classes) can start early.

```mermaid
pie showData
  title P0 Foundation — stories
  "Done" : 11
  "Open (2.6 browser router)" : 1
```

### Learning experience shipped ahead of plan (2026-09-23 – 09-24)

Built on the device (offline-first, local tables) while P0 waited for its start date. It pulls
parts of **P2 Engagement** forward; what is left for P2 is server-side (see the table).

| Area             | Shipped                                                                                                                                                                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit room (v2)   | Start a unit with a pace (3/2/1 weeks), countdown and one extension; next unit unlocks with the unit test (≥ 80 %); level 1 = Book 1 in two stages with stage tests, badges and a milestone screen; curated "Entdecken" media library.                                                                                  |
| Focused units    | One section per dialogue (listen, read, its words, write, speak), later sections closed; a closing section with the publisher's exercises, verbs and the unit test.                                                                                                                                                     |
| Guided writing   | Five counted steps (copy, dictation, transliteration, sentence building, translation) that continue where the learner left off and never repeat a solved task.                                                                                                                                                          |
| Cloze & library  | Cloze station per dialogue section from the example sentences; "Entdecken" pins started videos to "Weiterschauen" (last opened first, unpin anytime).                                                                                                                                                                   |
| Scoped training  | Training and free practice offer only the units reached so far; new SRS cards come only from those units (due reviews untouched).                                                                                                                                                                                       |
| "Heute"          | Opens with "Deine Einheit" (section, next station, deadline, "Fortsetzen"); level card with stage and total XP; daily check-in on the word of the day (+10 XP); wobbly words (last rated "Schwer"/"Nochmal") with an on-demand practice session; progress tiles explained; forgetting curve only after a broken streak. |
| XP (local)       | Reviews, heard tracks and lessons, practised items (+2 each, shown at once), unit on time (+50), stage (+250), daily check-in (+10).                                                                                                                                                                                    |
| Content (drafts) | Own texts for all 16 units: 401 words, 48 dialogues, 51 verbs, 471 example sentences (Tatoeba CC BY 2.0 FR + own); the publisher's audio and page videos per unit and dialogue.                                                                                                                                         |

**Next on the device side** (before or alongside P1):

1. Alphabet course for absolute beginners (grammar points per unit shipped).
2. Open P0 story 2.6 (browser router instead of hash URLs).
3. Teacher reviews the content drafts (words, dialogues, examples) — deferred: we continue
   without it for now and mark units as checked once he has looked at them.

## Why this order

A real teacher with a real class is the most valuable thing the project can have. So the
roadmap front-loads what he needs — **accounts, classes, daily/weekly achievements,
notifications and his Google Drive recordings** — and starts the **pilot on 2027-01-04**.
The AI teacher follows, informed by real usage data; YouTube lessons then reuse the
interactive player built for his recordings; app-store apps come once engagement is proven.

## Phases at a glance

Legend: dark = done, highlighted = in progress, light = planned; the red line is today.

```mermaid
gantt
  dateFormat YYYY-MM-DD
  axisFormat %b
  todayMarker on
  section Foundation
  P0 shipped early (11/12 stories)   :done, p0done, 2026-09-23, 12d
  P0 plan – monorepo, CI, CapRover   :active, p0, 2026-10-05, 28d
  G0 deploy + restore drill          :milestone, done, g0, 2026-09-23, 0d
  section Pilot readiness
  P1 Auth, roles, classes, admin v1  :p1, after p0, 28d
  P2 local XP, levels, check-in      :done, p2local, 2026-09-23, 2d
  P2 Engagement + notifications      :p2, after p1, 28d
  Pilot starts                       :milestone, crit, pilot, 2027-01-04, 0d
  P3 Teacher recordings (Drive)      :p3, after p2, 28d
  section AI
  P4 AI teacher al-Muʿallim          :p4, after p3, 42d
  section Media
  P5 Interactive YouTube             :p5, after p4, 14d
  section Apps
  P6 iOS/Android apps                :p6, after p5, 28d
  section Next level
  P7 Speech, FSRS, CMS, English UI   :p7, after p6, 28d
```

| Phase                            | Sprints | Dates (approx.) | Status  | Outcome / exit criteria                                                                                                                                                                                                                                                                           | Release               |
| -------------------------------- | ------- | --------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **P0 Foundation**                | S1–S2   | Oct 5 – Nov 1   | ◐ 11/12 | Monorepo, CI, Tabayyun-style CapRover deploy (`docs/ops/caprover-deployment.md`), API + worker, sync endpoints, Postgres queue, backups, error tracking.                                                                                                                                          | `v1.1`                |
| **P1 Identity, roles & classes** | S3–S4   | Nov 2 – Nov 29  | ☐       | Better Auth, RBAC, `ApiSyncProvider`, Supabase migrated, admin v1, **classes + invite links**.                                                                                                                                                                                                    | `v1.2` — Supabase off |
| **P2 Engagement**                | S5–S6   | Nov 30 – Dec 27 | ◐ local | XP, levels/stages, stage badges and daily check-in shipped on the device. Open: server sync of the engagement tables (`media_progress`, `practice_progress`, `unit_enrollments`, `daily_checkins`), daily quests, streak shields, class weekly challenge, teacher badges, Web Push, weekly recap. | `v1.3`                |
| **🎓 Pilot starts**              | —       | **Jan 4, 2027** | —       | Teacher's class onboarded.                                                                                                                                                                                                                                                                        | —                     |
| **P3 Teacher recordings**        | S7–S8   | Dec 28 – Jan 24 | ☐       | RustFS storage, Google Drive import + direct upload, transcode, transcripts, checkpoints, offline audio, assignments.                                                                                                                                                                             | `v1.4`                |
| **P4 AI teacher**                | S9–S11  | Jan 25 – Mar 7  | ☐       | LLM gateway (Anthropic / OpenRouter / HF), al-Muʿallim explain/converse/drill/grade, evals, review queue.                                                                                                                                                                                         | `v2.0-beta`           |
| **P5 Interactive YouTube**       | S12     | Mar 8 – Mar 21  | ☐       | Muhammad al-Andalusi channel import in the same player.                                                                                                                                                                                                                                           | `v2.0`                |
| **P6 Mobile apps**               | S13–S14 | Mar 22 – Apr 18 | ☐       | Capacitor iOS/Android, native reminders & push, offline audio, store release, opt-in leagues, certificates.                                                                                                                                                                                       | `v2.1` (stores)       |
| **P7 Next level**                | S15–S16 | Apr 19 – May 16 | ☐       | Server STT pronunciation, FSRS, content CMS, English UI, accessibility.                                                                                                                                                                                                                           | `v2.2`                |

## Milestone gates

1. **G0 (end S2):** one-command deploy to CapRover; restore drill passed. ✅ met 2026-09-23.
2. **G1 (end S4):** RBAC matrix test green; users migrated; teacher can create a class and invite.
3. **G2 (end S6, pilot go/no-go):** engagement loop works offline and on 3 test phones;
   notifications delivered; teacher trained. → pilot starts Jan 4.
4. **G3 (end S8):** ≥ 5 teacher recordings published with checkpoints; consent recorded.
5. **G4 (end S11):** tutor eval scores on target; AI cost per active learner ≤ €3.
6. **G5 (end S14):** apps approved in both stores; pilot metrics (engagement plan §8) reviewed.

## Dependencies & risks

| Risk                                          | Likelihood | Mitigation                                                                |
| --------------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| Pilot slips because auth/classes take longer  | Medium     | S4 scope has a fallback: invite-by-email only, admin panel minimal.       |
| Recording consent (students, minors) unclear  | Medium     | Consent step in publish flow; audio-only option; per-class AI off switch. |
| Shared RustFS/server capacity with Tabayyun   | Medium     | Transcode concurrency 1, night-time transcription, disk alerts, 8 GB RAM. |
| Gamification boosts activity but not learning | Medium     | Guardrail metric (mature words); XP soft caps.                            |
| Creator permission (al-Andalusi) delayed      | Medium     | YouTube phase is late and embed-only works without transcripts.           |
| AI Arabic vocalisation errors                 | Medium     | Validators, grounding, evals, teacher override loop.                      |
| App-store review rejections                   | Low–Med    | Account deletion, privacy labels, offline value; TestFlight early (S13).  |
| Scope creep                                   | High       | Phase exit criteria; P7 is the buffer.                                    |
