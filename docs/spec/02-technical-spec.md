# 02 — Technical Specification

- Status: draft v1 · Date: 2026-09-23
- Decisions referenced: ADR-0006 … ADR-0015

## 1. Target architecture

```mermaid
flowchart LR
  subgraph Client["PWA (apps/web) — offline-first"]
    UI[React modules] --> Stores[Zustand]
    Stores --> Dexie[(IndexedDB)]
    Stores --> SyncEngine
    SyncEngine --> ApiSync[ApiSyncProvider]
    UI --> TutorClient[Tutor SSE client]
    UI --> YTPlayer[YouTube IFrame API]
  end

  subgraph CapRover["CapRover (Docker Swarm) on EU VPS"]
    Nginx[captain-nginx + Let's Encrypt]
    Web[web: static PWA]
    API[api: Hono on Node 22]
    Worker[worker: BullMQ jobs]
    PG[(Postgres 16)]
    Redis[(Redis 7)]
    S3[(MinIO — optional)]
  end

  ApiSync -->|/v1/sync| Nginx --> API
  TutorClient -->|/v1/tutor SSE| Nginx
  Nginx --> Web
  API --> PG
  API --> Redis
  Worker --> PG
  Worker --> Redis
  API --> LLM{{LLM Gateway}}
  Worker --> LLM
  LLM --> Anthropic[Anthropic API]
  LLM --> OpenRouter[OpenRouter]
  LLM --> HF[Hugging Face Inference]
  Worker --> YTData[YouTube Data API v3]
```

**Principles:** the device stays the source of truth for learning state (ADR-0002); the server
owns identity, authorisation, shared content, AI, and aggregates. Secrets never reach the browser.

## 2. Repository layout (ADR-0006)

```
apps/
  web/            ← today's src/ moves here unchanged (Vite PWA)
  api/            ← Hono HTTP API (auth, sync, tutor, admin, teacher, video)
  worker/         ← BullMQ consumers (video import, batch exercise generation, exports)
packages/
  shared/         ← zod schemas + TS types shared by web/api (SrsCard, SyncTable, DTOs)
  srs/            ← pure SRS engine (moved from services/srs; used by web + worker analytics)
  llm/            ← LlmProvider interface + Anthropic/OpenRouter/HF adapters + router
  content/        ← curriculum JSON + validators + offline-bundle builder
infra/
  caprover/       ← captain-definition files, one per app
  docker/         ← Dockerfiles
docs/
```

npm workspaces (no extra tooling). Each package has its own `tsconfig`, `vitest` config, and
`lint` target; root scripts fan out (`npm run test -ws`).

## 3. Backend stack

| Concern            | Choice                                                     | Why (short)                                                                          |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| HTTP               | **Hono** on Node 22                                        | Tiny, typed, Web-standard `Request/Response`, first-class SSE streaming.             |
| Validation         | **zod** (from `packages/shared`)                           | One schema for client + server.                                                      |
| DB                 | **Postgres 16** + **Drizzle ORM** + drizzle-kit migrations | SQL-first, typed, no runtime magic. Pool via `pg` (`max` per env).                   |
| Auth               | **Better Auth** (ADR-0008)                                 | Self-hosted, magic link + password + passkeys + OAuth, admin & organization plugins. |
| Jobs               | **BullMQ** on Redis                                        | Retries, backoff, cron for imports & budgets.                                        |
| Cache / rate limit | Redis                                                      | Sliding-window limits per user/role/IP; content ETag cache.                          |
| Email              | SMTP via env (Brevo/Postmark/Resend/self-hosted)           | Magic links, invites.                                                                |
| Logs               | pino (JSON) → stdout → CapRover logs; optional Loki        | Structured, context-aware (`reqId`, `userId`, `route`).                              |
| Errors             | Sentry-compatible (GlitchTip self-hosted on CapRover)      | Web + API.                                                                           |

## 4. Data model (Postgres)

Existing sync tables keep their shape and `(user_id, id)` PK (`supabase/schema.sql`), with
`user_id` referencing our `users` table instead of `auth.users`.

```sql
-- identity (managed by Better Auth; names illustrative)
users(id uuid pk, email citext unique, name text, role text check (role in ('student','teacher','admin')) default 'student',
      locale text default 'de', disabled_at timestamptz, created_at, updated_at)
sessions(...), accounts(...), verifications(...), passkeys(...)          -- Better Auth tables

-- classes & RBAC (ADR-0009)
classes(id uuid pk, name text, owner_id uuid fk users, invite_code text unique, settings jsonb, archived_at, created_at)
class_members(class_id fk, user_id fk, class_role text check (class_role in ('teacher','student')), joined_at,
              primary key (class_id, user_id))
assignments(id uuid pk, class_id fk, title, kind text, payload jsonb, due_at, created_by fk, created_at)
assignment_submissions(assignment_id fk, user_id fk, status text, score numeric, ai_feedback jsonb,
              teacher_override jsonb, updated_at, primary key (assignment_id, user_id))

-- learning data (sync, unchanged columns)
srs_cards, review_logs, exam_results, settings, user_vocab   -- PK (user_id, id), index (user_id, updated_at)
video_progress(user_id, id, video_id, watched_ratio, checkpoint_results jsonb, updated_at, deleted)  -- new sync table

-- content CMS (ADR-0014)
content_units(id int pk, version int, status text, data jsonb, published_at, updated_by)
content_releases(version int pk, bundle_url text, checksum text, created_at, created_by)

-- video (ADR-0012)
video_channels(id text pk /* YouTube channelId */, title, handle, permission_status text, notes)
videos(id text pk /* youtube videoId */, channel_id fk, title, duration_s int, unit int null, status text, meta jsonb)
video_segments(id uuid pk, video_id fk, start_s int, end_s int, title, unit int)
video_checkpoints(id uuid pk, video_id fk, at_s int, kind text, payload jsonb, sort int)
video_transcripts(video_id fk, lang text, source text, cues jsonb, licensed boolean, primary key (video_id, lang))

-- AI (ADR-0010/0011)
ai_conversations(id uuid pk, user_id fk, mode text, context jsonb, created_at, archived_at)
ai_messages(id uuid pk, conversation_id fk, role text, content jsonb, provider text, model text,
            input_tokens int, output_tokens int, cache_read_tokens int, cost_micros bigint, latency_ms int,
            feedback smallint null, created_at)
ai_usage_daily(user_id, day date, tokens_in bigint, tokens_out bigint, cost_micros bigint, primary key (user_id, day))
ai_model_routes(task text pk, provider text, model text, params jsonb, fallback jsonb, updated_by, updated_at)
prompt_versions(id text pk, task text, body text, created_at, active boolean)

audit_log(id bigserial pk, actor_id, action text, target text, before jsonb, after jsonb, at timestamptz default now())
```

Indexes: every FK; `(user_id, updated_at)` on sync tables; `ai_messages(conversation_id, created_at)`;
`ai_usage_daily(day)`; `videos(channel_id, unit)`; `audit_log(at desc)`. All list endpoints are
**keyset-paginated** (`?cursor=&limit=`, max 100).

## 5. API surface (v1, JSON, `/v1`)

| Area    | Endpoints                                                                                                                                                       | Authz                 |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Auth    | `/v1/auth/*` (Better Auth handler)                                                                                                                              | public                |
| Me      | `GET /me`, `PATCH /me`, `GET /me/export`, `DELETE /me`                                                                                                          | self                  |
| Sync    | `POST /sync/:table/push`, `GET /sync/:table/pull?since=`                                                                                                        | self; table whitelist |
| Content | `GET /content/manifest`, `GET /content/bundle/:version` (ETag, immutable)                                                                                       | public                |
| Tutor   | `POST /tutor/conversations`, `POST /tutor/conversations/:id/messages` (**SSE**), `POST /tutor/grade`, `POST /tutor/exercises`, `POST /ai-messages/:id/feedback` | self + quota          |
| Video   | `GET /videos?unit=`, `GET /videos/:id` (segments, checkpoints, transcript)                                                                                      | signed-in             |
| Teacher | `/classes`, `/classes/:id/members`, `/classes/:id/progress`, `/classes/:id/assignments`, `/submissions/:id/override`                                            | class teacher         |
| Admin   | `/admin/users`, `/admin/classes`, `/admin/content/*`, `/admin/videos/import`, `/admin/ai/routes`, `/admin/ai/usage`, `/admin/audit`                             | admin                 |
| Ops     | `GET /healthz`, `GET /readyz`                                                                                                                                   | internal              |

The sync contract is identical to today's `SyncProvider` (`push(table, records)`,
`pull(table, since)`), so `ApiSyncProvider` is a drop-in replacement for `SupabaseSyncProvider`.
Server enforces `user_id` from the session — never from the payload (same guarantee RLS gives today).

## 6. LLM gateway (ADR-0010)

```ts
// packages/llm/src/types.ts
export interface ChatRequest {
  task: LlmTask; // 'tutor.converse' | 'tutor.explain' | 'grade.writing' | 'exercise.generate' | ...
  system: SystemBlock[]; // stable, cacheable prefix first
  messages: ChatMessage[];
  tools?: ToolSpec[];
  responseSchema?: ZodTypeAny; // structured output when the provider supports it
  maxTokens: number;
  userRef: string; // hashed user id for provider abuse tracking
}
export interface LlmProvider {
  readonly id: 'anthropic' | 'openrouter' | 'huggingface';
  stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent>; // text deltas, tool calls, usage
  complete(req: ChatRequest, signal: AbortSignal): Promise<ChatResult>;
}
export interface ModelRouter {
  resolve(task: LlmTask, ctx: { role: Role; budgetState: BudgetState }): RouteDecision; // provider + model + params + fallbacks
}
```

- **Anthropic adapter** uses the official `@anthropic-ai/sdk` (streaming, prompt caching,
  adaptive thinking with `output_config.effort`, structured outputs, typed errors).
- **OpenRouter adapter** uses OpenRouter's OpenAI-compatible chat endpoint for non-Claude models
  (Qwen, Llama, Mistral, Gemma, Jais/ALLaM where available).
- **Hugging Face adapter** uses HF Inference Providers (chat completion) or a dedicated
  Inference Endpoint URL — also for embeddings and Whisper STT (ADR-0015).
- Router table `ai_model_routes` is editable in the admin panel; defaults in §6.1.
- Every call is metered (`ai_messages`, `ai_usage_daily`) and checked against quotas **before**
  it is sent (Redis counters) — see `plan/cost-plan.md` §4.

### 6.1 Default routing (changeable at runtime)

| Task                                | Primary                                             | Fallback              | Rationale                                    |
| ----------------------------------- | --------------------------------------------------- | --------------------- | -------------------------------------------- |
| `tutor.converse`, `tutor.explain`   | Anthropic `claude-sonnet-5` (effort `low`/`medium`) | OpenRouter open model | Best Arabic quality/price for dialogue.      |
| `grade.writing`, `grade.speech`     | Anthropic `claude-sonnet-5` (structured output)     | `claude-haiku-4-5`    | Needs reliable rubric + JSON.                |
| `exercise.generate` (bulk, offline) | Anthropic Batch API `claude-haiku-4-5`              | OpenRouter open model | 50 % batch discount, teacher reviews output. |
| `tutor.coach` (weekly plan)         | `claude-haiku-4-5`                                  | —                     | Short, cheap.                                |
| `content.author-assist` (admin)     | `claude-opus-5`                                     | `claude-sonnet-5`     | Rare, quality-critical.                      |
| `embed.*`                           | HF sentence-embedding model                         | —                     | RAG over curriculum + transcripts.           |
| `stt.*`                             | HF Whisper (large-v3 / turbo)                       | browser STT           | Pronunciation (ADR-0015).                    |

## 7. al-Muʿallim internals (ADR-0011)

- **Prompt layout (cache-friendly):** `[persona + pedagogy rules]` → `[unit curriculum pack]`
  (both cached) → `[learner snapshot: level, due/leech words, settings]` → conversation.
- **Tools** (server-executed, scoped to the caller's `userId`):
  `lookup_vocab(query)`, `get_root_family(root)`, `get_learner_state()`,
  `propose_srs_cards(items[])` (client confirms → outbox), `make_exercise(spec)`,
  `get_video_segment(videoId, t)`.
- **Validators** after generation: tashkīl coverage check, Arabic-script sanity, JSON schema,
  banned-topic filter; failed validation → one repair retry → graceful message.
- **Evals:** golden set of ~200 prompts per task (grammar explanations, grading cases with
  teacher-labelled scores); run in CI on prompt/model change with a small budget; teacher
  overrides feed new cases.

## 8. Deployment on CapRover (ADR-0007, ADR-0013)

| CapRover app      | Image                          | Persistent | Notes                                                |
| ----------------- | ------------------------------ | ---------- | ---------------------------------------------------- |
| `suffa-web`       | `nginx:alpine` + built PWA     | no         | SPA fallback, long-cache hashed assets, CSP headers  |
| `suffa-api`       | Node 22 slim                   | no         | `instances: 2`, health `/readyz`                     |
| `suffa-worker`    | same image, `CMD worker`       | no         | 1 instance                                           |
| `suffa-db`        | one-click **PostgreSQL 16**    | yes        | not exposed publicly; nightly `pg_dump` → off-box S3 |
| `suffa-redis`     | one-click **Redis 7**          | yes (AOF)  | internal only                                        |
| `suffa-minio`     | one-click MinIO (optional)     | yes        | user audio recordings, content bundles               |
| `suffa-glitchtip` | one-click GlitchTip (optional) | yes        | error tracking                                       |

CI (GitHub Actions): lint → typecheck → test → build images → push to GHCR →
`caprover deploy --imageName ghcr.io/...:sha` using an **app token** stored as a GitHub secret.
Env vars (API keys, DB URL, SMTP, YouTube key) are set per app in CapRover — never in the repo.

## 9. Conventions

- New code and APIs in **English**; established domain terms stay (`wurzel`, `wazn`, `einheit`)
  and are aliased in `packages/shared` DTOs to avoid a breaking content rename.
- ADRs for every decision that is hard to reverse; `TODO(YYYY-MM-DD):` format.
- Conventional commits; PRs must be green on lint/typecheck/test.

## 10. Security checklist (summary)

Server-side authz middleware per route group; zod validation on every input; parameterised
SQL only (Drizzle); CSRF protection for cookie sessions (SameSite=Lax + origin check); CSP
allowing only `youtube-nocookie.com`/`youtube.com` frames; rate limits (auth, tutor); audit log
for privileged actions; prompt-injection hardening (tools re-check authz, never trust model
output for authorisation, transcripts treated as untrusted data); dependency scanning in CI.

## 11. Testing strategy

| Level       | Scope                                                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| Unit        | srs, reconcile (existing), router/quota logic, validators, authz policies                                |
| Integration | API + real Postgres (Testcontainers) for sync, RBAC, assignments; LLM adapters against recorded fixtures |
| Contract    | `ApiSyncProvider` runs the existing `tests/sync.engine.integration.test.ts` suite                        |
| E2E         | Playwright: sign-in, offline review, tutor chat (mock provider), video checkpoint, admin role change     |
| AI evals    | Golden sets per task, scored in CI on change (budget-capped)                                             |
