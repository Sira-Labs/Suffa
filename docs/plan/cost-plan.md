# Suffa — Cost Plan

- Date: 2026-09-24 (v2: shared CapRover/RustFS, recordings, app stores) · Currency: USD for AI (providers bill in USD), EUR for hosting.
- **Prices change — verify before budgeting.** Anthropic list prices below are first-party API
  rates as of this document; infra prices are ranges for typical EU VPS offers.

## 1. Fixed monthly infrastructure (CapRover, shared with Tabayyun)

Suffa runs on the **same CapRover server as Tabayyun** and reuses its **RustFS** (ADR-0017), so
the marginal hosting cost is mostly RAM/disk headroom.

| Item                                                           | Stage 1 (pilot, ≤ 100 learners) | Stage 2 (≤ 1,000 learners) | Notes                                           |
| -------------------------------------------------------------- | ------------------------------- | -------------------------- | ----------------------------------------------- |
| Server upgrade/headroom for Suffa (to 8 GB RAM / 4 vCPU total) | €5–15                           | €30–60 (dedicated node)    | Marginal cost on the existing Hetzner-class VPS |
| Extra disk for recordings on RustFS (≈ 100–200 GB volume)      | €5–10                           | €20–40                     | See §2.4 for sizing                             |
| Off-box backups (DB dumps + recording originals)               | €3–5                            | €10–20                     | S3-compatible / Storage Box                     |
| Domain + DNS                                                   | ~€2                             | ~€2                        | Subdomain of an existing domain = €0            |
| Transactional email                                            | €0 (free tier)                  | €10–25                     | Magic links, recaps                             |
| Push: Web Push (VAPID), FCM/APNs                               | €0                              | €0                         | Free services                                   |
| Google APIs: Drive, Picker, YouTube Data                       | €0                              | €0                         | Within free quotas                              |
| Error tracking / uptime                                        | €0                              | €0                         | Self-hosted                                     |
| **Subtotal**                                                   | **≈ €15–35**                    | **≈ €70–150**              |                                                 |

### App stores (from Sprint 13)

| Item                                                         | Cost                    |
| ------------------------------------------------------------ | ----------------------- |
| Apple Developer Program                                      | $99 / year (≈ €8/month) |
| Google Play Console                                          | $25 one-off             |
| macOS build runner (GitHub Actions macOS minutes or own Mac) | €0–20/month             |

## 2. AI unit costs

### 2.1 Anthropic list prices (per 1M tokens)

| Model            | ID                 | Input | Output | Cache read (~0.1× input) |
| ---------------- | ------------------ | ----- | ------ | ------------------------ |
| Claude Haiku 4.5 | `claude-haiku-4-5` | $1.00 | $5.00  | ~$0.10                   |
| Claude Sonnet 5  | `claude-sonnet-5`  | $2.00 | $10.00 | ~$0.20                   |
| Claude Opus 5    | `claude-opus-5`    | $5.00 | $25.00 | ~$0.50                   |

Cache writes cost ~1.25× input (5-min TTL). **Batch API: −50 %** for offline jobs.
OpenRouter / Hugging Face open-weight models are typically several times cheaper per token
than Haiku; they are used as fallbacks and for bulk work where evals show acceptable quality.

### 2.2 Cost per tutor turn (model)

Assumed turn: 4,000 tokens cached prefix (persona + curriculum pack), 2,100 uncached
(learner snapshot + recent history + message), 400 output tokens.

| Model     | Cached in | Uncached in | Output  | **≈ per turn** |
| --------- | --------- | ----------- | ------- | -------------- |
| Haiku 4.5 | $0.0004   | $0.0021     | $0.0020 | **$0.0045**    |
| Sonnet 5  | $0.0008   | $0.0042     | $0.0040 | **$0.0090**    |
| Opus 5    | $0.0020   | $0.0105     | $0.0100 | **$0.0225**    |

Add ~20 % headroom for cache writes, thinking tokens at low effort and retries.
Blended default route (70 % Haiku for drills/coach/short answers, 30 % Sonnet for conversation
and grading) ≈ **$0.006 per turn** (≈ $0.0072 with headroom).

Other units: writing grade ≈ $0.01–0.02 (Sonnet, structured) · weekly coach plan ≈ $0.005 ·
exercise generation via Batch (Haiku) ≈ $0.001 per exercise · speech-to-text (hosted Whisper
class) ≈ low single-digit cents per audio-minute; browser STT stays free.

### 2.4 Teacher recordings (storage + transcription)

| Item                                                               | Size / cost per 1 h session                              |
| ------------------------------------------------------------------ | -------------------------------------------------------- |
| Original from Drive (1080p)                                        | ~1–2 GB (kept, backed up)                                |
| 720p MP4 transcode                                                 | ~0.6–1 GB                                                |
| Audio-only (Opus/AAC 64 kbps)                                      | ~30 MB                                                   |
| Transcription, `faster-whisper` in our worker                      | €0 marginal (CPU time at night)                          |
| Transcription, hosted Whisper (HF endpoint)                        | ≈ a few cents per hour of audio (verify current pricing) |
| AI chapter/checkpoint suggestions (Haiku, ~15k tokens in / 2k out) | ≈ $0.03                                                  |

Example: 2 sessions/week × 40 weeks = 80 h/year → **≈ 150–250 GB/year** if originals are kept;
~60–80 GB if originals are deleted after transcoding (teacher setting). Bandwidth is covered
by typical VPS traffic allowances (20 TB).

## 3. Scenarios (monthly)

| Scenario                                             | Usage assumptions                                        | AI                             | Infra   | **Total**      | **Per learner** |
| ---------------------------------------------------- | -------------------------------------------------------- | ------------------------------ | ------- | -------------- | --------------- |
| **A — Personal** (you + 1–2 learners)                | 20 turns/day, 30 days each                               | $4–13                          | €15–30  | **≈ €20–45**   | —               |
| **B0 — Pilot before AI** (Jan–Mar 2027, 30 students) | engagement, recordings (local Whisper), no LLM           | $0                             | €15–35  | **≈ €15–35**   | **≈ €1**        |
| **B — Pilot class** (1 teacher, 30 students)         | 10 turns/day × 20 days; 8 graded texts/student           | ≈ $45 (turns $43 + grading $4) | €15–30  | **≈ €60–75**   | **≈ €2.2**      |
| **C — Small school** (300 learners)                  | as B                                                     | ≈ $470                         | €50–100 | **≈ €490–560** | **≈ €1.7**      |
| **C′ — C with aggressive routing**                   | 50 % open models (~$0.001/turn), 40 % Haiku, 10 % Sonnet | ≈ $260                         | €50–100 | **≈ €290–360** | **≈ €1.1**      |

USD ≈ EUR assumed for simplicity. Target from the product spec: **≤ €3 per active learner/month** — met in all scenarios.

## 4. Cost controls (built into ADR-0010)

1. **Prompt caching** of the persona + curriculum prefix (keep it byte-stable; volatile data
   after the cache breakpoint; verify `cache_read_input_tokens > 0`).
2. **Routing by task**, cheapest model that passes evals; Opus only for admin authoring.
3. **Quotas**: default 30 tutor turns/day (student), 100 (teacher), configurable per class.
4. **Global budget** (e.g. $100/month in Stage 1): 80 % → downgrade routes; 100 % → AI read-only.
5. **Batch API** for bulk exercise generation and nightly checkpoint suggestions (−50 %).
6. **Short outputs** by default (`max_tokens` per task; concise style rules), low effort for chat.
7. **Spend dashboard** + alert email at 50/80/100 % of budget.

## 5. Build effort (one-off)

| Phase                        | Sprints | Story points | Developer-days (≈ 0.5 d/pt) |
| ---------------------------- | ------- | ------------ | --------------------------- |
| P0 Foundation                | S1–S2   | 40           | ~20                         |
| P1 Identity, roles & classes | S3–S4   | 40           | ~20                         |
| P2 Engagement                | S5–S6   | 36           | ~18                         |
| P3 Teacher recordings        | S7–S8   | 40           | ~20                         |
| P4 AI teacher                | S9–S11  | 60           | ~30                         |
| P5 Interactive YouTube       | S12     | 18           | ~9                          |
| P6 Mobile apps               | S13–S14 | 34           | ~17                         |
| P7 Next level                | S15–S16 | ~40          | ~20                         |
| **Total**                    | **16**  | **~308**     | **~154 dev-days**           |

Multiply by your day rate for an external budget; with AI-assisted development, expect the lower
end. Development-time AI spend (evals in CI, prompt iteration) budget: ~$30–80/month during P4–P7.

## 6. One-off / other costs

- Content: entering Book 1 units 4–16 (≈ 3–5 days teacher time) — check the publisher's copyright
  terms before publishing book content beyond personal/demo use.
- Legal: privacy policy + DPA review with LLM providers (EU users, possibly minors).
- Optional: honorarium/partnership with Muhammad al-Andalusi if deeper integration is agreed.
