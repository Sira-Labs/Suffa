# 00 — Codebase Analysis (baseline for the Suffa programme)

- Date: 2026-09-23
- Baseline commit: `f26cc8b` (PR #1 merged: offline-first PWA for "العربية بين يديك", Book 1)
- Health at baseline: `npm test` → **44/44 passing** (4 files) · `npm run lint` clean · `npm run typecheck` clean

## 1. What exists today

A **client-only, offline-first PWA** (German UI, MSA content with full tashkīl) that
teaches Book 1 of _Al-Arabiyya bayna Yadayk_.

| Layer             | Implementation                                                            | Notes                                                   |
| ----------------- | ------------------------------------------------------------------------- | ------------------------------------------------------- |
| UI                | React 18 + Vite 5 + TypeScript strict, `createHashRouter`                 | 10 feature modules under `src/modules/*`                |
| State             | Zustand stores (`settings`, `srs`, `sync`, `content`)                     | Thin; business logic lives in services                  |
| Local persistence | Dexie / IndexedDB (`src/services/storage/db.ts`)                          | Single source of truth on the device                    |
| Learning engine   | SM-2 variant, 4-button rating, leech detection (`services/srs/engine.ts`) | Pure functions, well tested (ADR-0001)                  |
| Sync              | Outbox → push → pull → LWW reconcile (`services/sync/*`)                  | Provider interface + Supabase/Noop (ADR-0002, ADR-0004) |
| Backend           | Supabase (Postgres + Magic Link + RLS)                                    | Schema in `supabase/*.sql`, PK `(user_id, id)`          |
| Speech            | Browser `SpeechSynthesis` + `webkitSpeechRecognition` (`ar-SA`)           | Browser-dependent; no Firefox STT                       |
| Content           | JSON bundled at build time via `import.meta.glob` (ADR-0003)              | **3 units, 10 vocab items, 2 dialogues**, 4 sources     |
| Video             | `Library.tsx` embeds a YouTube URL in an iframe                           | 1 playlist + 1 video; no interaction                    |
| Quality           | Vitest + Testing Library, ESLint 9 flat config, Prettier                  | Unit tests for SRS + reconcile, 2 integration tests     |

### Module inventory

`dashboard`, `vocab` (SRS review, add-your-own vocab), `roots` (root explorer), `reading`
(tap-a-word gloss), `writing` (dictation/translation), `speaking` (shadowing, minimal pairs),
`conjugation` (mādī / muḍāriʿ / amr tables), `exam` (interleaved, speed, adaptive), `library`,
`settings`.

## 2. Strengths to keep

1. **Clean seams.** `SyncProvider` is injected into `SyncEngine`; swapping Supabase for our
   own API is a new class, not a rewrite. This is the key enabler for the CapRover migration.
2. **Offline-first is real.** IndexedDB-first reads/writes, persistent outbox, tombstones.
3. **Pedagogy is explicit** (`docs/didactics.md`): active recall, interleaving, root/pattern
   backbone, tashkīl levels. The AI teacher must _reuse_ these, not replace them.
4. **Typed error paths** (`Result<T>`) and a structured logger (`services/logger.ts`).
5. **Deterministic card IDs** (`kind:contentRef`) make multi-device merges trivial.

## 3. Gaps and risks (what blocks "next level")

| #   | Gap                                                                                                                                                                     | Impact                                                                      | Addressed by                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| G1  | **No server of our own.** Everything runs in the browser.                                                                                                               | LLM API keys cannot be held client-side; no place for roles, quotas, admin. | ADR-0006, ADR-0007                                                           |
| G2  | **Single-user model.** RLS is `user_id = auth.uid()`; no roles, no classes.                                                                                             | Teacher/student/admin access impossible.                                    | ADR-0008, ADR-0009                                                           |
| G3  | **Tiny content set** (10 vocab items) baked into the bundle.                                                                                                            | Changing content needs a redeploy; teachers can't author.                   | ADR-0014                                                                     |
| G4  | **No AI at all.** Feedback is rule-based (char diff).                                                                                                                   | No conversation practice, no explanations, no free-text grading.            | ADR-0010, ADR-0011                                                           |
| G5  | **Video is a passive iframe.**                                                                                                                                          | No checkpoints, transcripts, or links into SRS.                             | ADR-0012                                                                     |
| G6  | **Vendor lock-in to Supabase Cloud**; user wants self-hosting on CapRover.                                                                                              | Data sovereignty, cost control.                                             | ADR-0007, ADR-0013                                                           |
| G7  | **Speech depends on browser STT** (Chrome/Edge only, no scoring).                                                                                                       | Pronunciation feedback unreliable.                                          | ADR-0015                                                                     |
| G8  | **No CI pipeline** (`.github/` absent).                                                                                                                                 | Regressions reach `main` unchecked.                                         | Sprint 1                                                                     |
| G9  | **Mixed-language identifiers** (`Vokabel`, `wurzel`, `einheit` next to `SrsCard`).                                                                                      | Friction for new contributors; API contracts become bilingual.              | Convention in 02-technical-spec §9 (keep domain terms, English for new code) |
| G10 | **HashRouter.** Fine for static hosting, but deep links/SEO for a public landing page are poor.                                                                         | Minor.                                                                      | ✅ Done 2026-09-24 (story 2.6)                                               |
| G11 | No observability (errors/metrics) in production.                                                                                                                        | Blind to failures and AI spend.                                             | ADR-0013                                                                     |
| G12 | **Engagement is minimal and UTC-based.** `computeStreak` (`services/stats.ts`) counts UTC days; only a streak, daily goal and heat-map exist — no XP, quests or badges. | Streaks break wrongly for learners outside UTC; little to motivate a class. | ADR-0016, `plan/engagement-plan.md`                                          |
| G13 | **No file storage.** Audio recordings and media have nowhere to live.                                                                                                   | Teacher recordings and speaking submissions impossible.                     | ADR-0017 (shared RustFS), ADR-0018                                           |

## 4. Migration constraints derived from the code

- **Keep the outbox protocol.** The new API must speak the same `push(table, records)` /
  `pull(table, since)` contract so existing clients migrate without data loss.
- **Keep `(user_id, id)` composite keys** and camelCase JSON field names on the wire.
- **Keep the app usable offline and without login** (Noop provider path) — the AI features
  degrade gracefully to "needs connection".
- **SRS math stays client-side** (pure, instant, offline). The server only stores state.
