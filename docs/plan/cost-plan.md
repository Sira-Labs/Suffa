# Suffa — Cost Plan

- Date: 2026-09-23 · Currency: USD for AI (providers bill in USD), EUR for hosting.
- **Prices change — verify before budgeting.** Anthropic list prices below are first-party API
  rates as of this document; infra prices are ranges for typical EU VPS offers.

## 1. Fixed monthly infrastructure (CapRover)

| Item                                                 | Stage 1 (≤ 100 learners) | Stage 2 (≤ 1,000 learners) | Notes                               |
| ---------------------------------------------------- | ------------------------ | -------------------------- | ----------------------------------- |
| VPS for CapRover (4 vCPU / 8 GB → 8 vCPU / 16 GB)    | €10–20                   | €30–60                     | Hetzner/Netcup/OVH class; EU region |
| Off-box backup storage (S3-compatible / Storage Box) | €3–5                     | €5–10                      | 30 daily + 12 monthly dumps         |
| Domain + DNS                                         | ~€2                      | ~€2                        | €15–25/year                         |
| Transactional email (magic links)                    | €0 (free tier)           | €10–25                     | Brevo/Postmark/Resend or own SMTP   |
| Error tracking / uptime                              | €0                       | €0                         | GlitchTip + Uptime Kuma self-hosted |
| YouTube Data API                                     | €0                       | €0                         | 10k units/day default quota         |
| **Subtotal**                                         | **≈ €15–30**             | **≈ €50–100**              |                                     |

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

## 3. Scenarios (monthly)

| Scenario                                   | Usage assumptions                                        | AI                             | Infra   | **Total**      | **Per learner** |
| ------------------------------------------ | -------------------------------------------------------- | ------------------------------ | ------- | -------------- | --------------- |
| **A — Personal** (you + 1–2 learners)      | 20 turns/day, 30 days each                               | $4–13                          | €15–30  | **≈ €20–45**   | —               |
| **B — One class** (1 teacher, 30 students) | 10 turns/day × 20 days; 8 graded texts/student           | ≈ $45 (turns $43 + grading $4) | €15–30  | **≈ €60–75**   | **≈ €2.2**      |
| **C — Small school** (300 learners)        | as B                                                     | ≈ $470                         | €50–100 | **≈ €490–560** | **≈ €1.7**      |
| **C′ — C with aggressive routing**         | 50 % open models (~$0.001/turn), 40 % Haiku, 10 % Sonnet | ≈ $260                         | €50–100 | **≈ €290–360** | **≈ €1.1**      |

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

| Phase                | Sprints | Story points | Developer-days (≈ 0.5 d/pt) |
| -------------------- | ------- | ------------ | --------------------------- |
| P0 Foundation        | 2       | 40           | ~20                         |
| P1 Identity & roles  | 2       | 40           | ~20                         |
| P2 AI teacher MVP    | 3       | 53           | ~27                         |
| P3 Interactive video | 2       | 37           | ~19                         |
| P4 Teacher workspace | 2       | 35           | ~18                         |
| P5 Next level        | 3       | ~60          | ~30                         |
| **Total**            | **14**  | **~265**     | **~134 dev-days**           |

Multiply by your day rate for an external budget; with AI-assisted development, expect the lower
end. Development-time AI spend (evals in CI, prompt iteration) budget: ~$30–80/month during P2–P5.

## 6. One-off / other costs

- Content: entering Book 1 units 4–16 (≈ 3–5 days teacher time) — check the publisher's copyright
  terms before publishing book content beyond personal/demo use.
- Legal: privacy policy + DPA review with LLM providers (EU users, possibly minors).
- Optional: honorarium/partnership with Muhammad al-Andalusi if deeper integration is agreed.
