# Documentation — Suffa (الصُّفَّة)

| Document                                                     | Purpose                                                                |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| [spec/00-codebase-analysis.md](spec/00-codebase-analysis.md) | Baseline: what exists, strengths, gaps                                 |
| [spec/01-product-spec.md](spec/01-product-spec.md)           | Name, vision, roles, features, NFRs                                    |
| [spec/02-technical-spec.md](spec/02-technical-spec.md)       | Architecture, data model, API, LLM gateway, CapRover                   |
| [plan/roadmap.md](plan/roadmap.md)                           | Phases, milestones, risks                                              |
| [plan/sprint-plan.md](plan/sprint-plan.md)                   | Sprints S1–S16 with stories and acceptance criteria                    |
| [plan/cost-plan.md](plan/cost-plan.md)                       | Infra + AI costs, scenarios, cost controls, build effort               |
| [plan/engagement-plan.md](plan/engagement-plan.md)           | Daily/weekly achievements, notifications, teacher playbook, pilot plan |
| [ops/caprover-deployment.md](ops/caprover-deployment.md)     | What to deploy on CapRover (same pattern as Tabayyun)                  |
| [didaktik.md](didaktik.md)                                   | Pedagogical principles (existing)                                      |

## Architecture Decision Records

| ADR                                                   | Title                                                         | Status                                     |
| ----------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------ |
| [0001](adr/0001-srs-engine.md)                        | SRS engine (SM-2, 4-button)                                   | accepted                                   |
| [0002](adr/0002-sync-last-write-wins.md)              | Offline-first sync, last-write-wins                           | accepted                                   |
| [0003](adr/0003-content-loading.md)                   | Static content as versioned JSON                              | accepted, amended by 0014                  |
| [0004](adr/0004-sync-provider-abstraction.md)         | SyncProvider interface                                        | accepted, default provider changed by 0007 |
| [0005](adr/0005-platform-name-suffa.md)               | Platform name "Suffa", AI persona "al-Muʿallim"               | proposed                                   |
| [0006](adr/0006-monorepo-npm-workspaces.md)           | Monorepo with npm workspaces                                  | proposed                                   |
| [0007](adr/0007-self-hosted-backend-on-caprover.md)   | Self-hosted API + Postgres on CapRover (Supabase exit)        | proposed                                   |
| [0008](adr/0008-authentication-better-auth.md)        | Authentication with Better Auth                               | proposed                                   |
| [0009](adr/0009-rbac-roles-and-classes.md)            | RBAC: platform roles + class roles                            | proposed                                   |
| [0010](adr/0010-llm-provider-abstraction.md)          | LLM gateway: Anthropic SDK, OpenRouter, Hugging Face          | proposed                                   |
| [0011](adr/0011-ai-teacher-al-muallim.md)             | al-Muʿallim: grounded, tool-using AI teacher                  | proposed                                   |
| [0012](adr/0012-interactive-youtube-lessons.md)       | Interactive YouTube lessons (Muhammad al-Andalusi)            | proposed, amended by 0018                  |
| [0013](adr/0013-deployment-caprover-ci.md)            | Deployment, CI/CD and ops on CapRover (Tabayyun pattern)      | proposed                                   |
| [0014](adr/0014-content-cms-and-offline-bundles.md)   | DB-backed content CMS + offline bundles                       | proposed                                   |
| [0015](adr/0015-speech-and-pronunciation.md)          | Server-side STT for pronunciation                             | proposed                                   |
| [0016](adr/0016-engagement-xp-quests-achievements.md) | Engagement: XP, daily quests, weekly challenges, achievements | proposed                                   |
| [0017](adr/0017-object-storage-rustfs.md)             | Object storage on the existing RustFS                         | proposed                                   |
| [0018](adr/0018-teacher-recordings-google-drive.md)   | Teacher recordings: Google Drive import, hosted media lessons | proposed                                   |
| [0019](adr/0019-mobile-apps-capacitor-push.md)        | iOS/Android apps with Capacitor; push & local notifications   | proposed                                   |
| [0020](adr/0020-postgres-job-queue.md)                | Postgres job queue (pg-boss), no Redis                        | proposed                                   |
