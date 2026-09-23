# ADR-0020: Postgres-backed job queue (pg-boss) instead of Redis/BullMQ

- Status: proposed
- Date: 2026-09-24
- Amends: `02-technical-spec.md` §3, ADR-0010 (quota counters), ADR-0013 (no Redis app)

## Context

The first draft used Redis + BullMQ for jobs, rate limits and quota counters. The existing
Tabayyun deployment on the same CapRover runs **without Redis**, using a Postgres-based queue
(procrastinate). Suffa's job volume is small (imports, transcodes, engagement recomputes,
notifications), and one fewer stateful service means less to operate and back up.

## Decision

- Use **pg-boss** (Postgres job queue for Node): retries with backoff, cron schedules,
  singleton jobs, dead-letter queue. Queues: `sync-derived`, `media`, `engagement`,
  `notifications`, `imports`, `maintenance`.
- **Quota and rate limiting in Postgres**: atomic `INSERT … ON CONFLICT DO UPDATE` counters
  (`ai_usage_daily`, `rate_limits` with time-bucketed keys), plus a small in-process token
  bucket per API instance for burst control.
- Queue depth is reported by `/healthz` (as in Tabayyun).

## Alternatives

- Redis + BullMQ: faster at high volume; unnecessary at our scale, one more service.
- Graphile Worker: equally valid; pg-boss chosen for built-in cron and simpler API.

## Consequences

Deployment is four Suffa CapRover apps plus the shared RustFS (see `docs/ops/caprover-deployment.md`).
If job throughput ever outgrows Postgres, the `JobQueue` interface allows moving to Redis.
