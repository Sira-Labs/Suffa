/**
 * Postgres side of the AI gateway (stories 9.3, 9.4): the routing table the router reads, the
 * budget settings, and metering. A call's log row and its counters commit together, so the
 * quota and budget checks always see what was spent.
 */
import type pg from 'pg';
import type { Capability, Effort, ModelRoute, ProviderId, RouteSource } from '@suffa/llm';
import { writeAudit } from '../audit/log.js';
import type { Role } from '../authz/policies.js';
import { inTransaction } from '../db/transaction.js';

export interface AiSettings {
  monthlyBudgetMicro: number;
  downgradePercent: number;
  /** Tutor turns per day by platform role; null = no limit. */
  dailyTurns: Record<Role, number | null>;
}

export type RouteInput = Omit<ModelRoute, 'task' | 'position'>;

export interface CallRecord {
  userId: string | null;
  task: string;
  provider: ProviderId | null;
  model: string | null;
  /** ok | refusal | an error kind | quota | paused | unavailable */
  outcome: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicro: number;
  latencyMs: number;
  attempts: unknown[];
  /** Counts as a learner turn (the first call of a turn that a model answered). */
  turn: boolean;
}

export interface TaskUsage {
  task: string;
  model: string | null;
  calls: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costMicro: number;
}

export interface AiRepository extends RouteSource {
  replaceRoutes(
    task: string,
    routes: RouteInput[],
    context: { actorId: string; ipAddress: string | null }
  ): Promise<void>;
  settings(): Promise<AiSettings>;
  updateSettings(
    settings: AiSettings,
    context: { actorId: string; ipAddress: string | null }
  ): Promise<void>;
  /** Spend of the calendar month (UTC) that contains `now`. */
  monthSpend(now: Date): Promise<number>;
  /** Turns the user took today, in their own time zone. */
  turnsToday(userId: string, now: Date): Promise<number>;
  record(call: CallRecord, now: Date): Promise<void>;
  usageByTask(since: Date): Promise<TaskUsage[]>;
}

export function monthStart(now: Date): string {
  return `${now.toISOString().slice(0, 7)}-01`;
}

interface RouteRow {
  task: string;
  position: number;
  provider: ProviderId;
  model: string;
  effort: Effort | null;
  max_tokens: number;
  capabilities: Capability[];
  premium: boolean;
  enabled: boolean;
  price_input: string | null;
  price_output: string | null;
}

export class PgAiRepository implements AiRepository {
  constructor(private readonly pool: pg.Pool) {}

  async load(): Promise<ModelRoute[]> {
    const { rows } = await this.pool.query<RouteRow>(
      `select task, position, provider, model, effort, max_tokens, capabilities, premium,
              enabled, price_input, price_output
         from ai_model_routes order by task, position`
    );
    return rows.map((r) => ({
      task: r.task,
      position: r.position,
      provider: r.provider,
      model: r.model,
      effort: r.effort,
      maxTokens: r.max_tokens,
      capabilities: r.capabilities,
      premium: r.premium,
      enabled: r.enabled,
      price:
        r.price_input !== null && r.price_output !== null
          ? { input: Number(r.price_input), output: Number(r.price_output) }
          : null,
    }));
  }

  async replaceRoutes(
    task: string,
    routes: RouteInput[],
    context: { actorId: string; ipAddress: string | null }
  ) {
    await inTransaction(this.pool, async (db) => {
      const before = await db.query(
        'select provider, model, enabled from ai_model_routes where task = $1 order by position',
        [task]
      );
      await db.query('delete from ai_model_routes where task = $1', [task]);
      for (const [position, r] of routes.entries()) {
        await db.query(
          `insert into ai_model_routes (task, position, provider, model, effort, max_tokens,
             capabilities, premium, enabled, price_input, price_output, updated_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            task,
            position,
            r.provider,
            r.model,
            r.effort,
            r.maxTokens,
            r.capabilities,
            r.premium,
            r.enabled,
            r.price?.input ?? null,
            r.price?.output ?? null,
            context.actorId,
          ]
        );
      }
      await writeAudit(db, {
        actorId: context.actorId,
        action: 'ai.routes.replace',
        targetType: 'ai_task',
        targetId: task,
        details: {
          before: before.rows,
          after: routes.map((r) => ({
            provider: r.provider,
            model: r.model,
            enabled: r.enabled,
          })),
        },
        ipAddress: context.ipAddress,
      });
    });
  }

  async settings(): Promise<AiSettings> {
    const { rows } = await this.pool.query(
      `select monthly_budget_micro, downgrade_percent, student_daily_turns,
              teacher_daily_turns, admin_daily_turns
         from ai_settings where id`
    );
    const r = rows[0];
    return {
      monthlyBudgetMicro: Number(r.monthly_budget_micro),
      downgradePercent: r.downgrade_percent,
      dailyTurns: {
        student: r.student_daily_turns,
        teacher: r.teacher_daily_turns,
        admin: r.admin_daily_turns,
      },
    };
  }

  async updateSettings(
    settings: AiSettings,
    context: { actorId: string; ipAddress: string | null }
  ) {
    await inTransaction(this.pool, async (db) => {
      await db.query(
        `update ai_settings set monthly_budget_micro = $1, downgrade_percent = $2,
           student_daily_turns = $3, teacher_daily_turns = $4, admin_daily_turns = $5,
           updated_by = $6, updated_at = now()
         where id`,
        [
          settings.monthlyBudgetMicro,
          settings.downgradePercent,
          settings.dailyTurns.student,
          settings.dailyTurns.teacher,
          settings.dailyTurns.admin,
          context.actorId,
        ]
      );
      await writeAudit(db, {
        actorId: context.actorId,
        action: 'ai.settings.update',
        targetType: 'ai_settings',
        targetId: 'global',
        details: { ...settings },
        ipAddress: context.ipAddress,
      });
    });
  }

  async monthSpend(now: Date): Promise<number> {
    const { rows } = await this.pool.query(
      'select cost_micro from ai_spend_monthly where month = $1',
      [monthStart(now)]
    );
    return rows[0] ? Number(rows[0].cost_micro) : 0;
  }

  async turnsToday(userId: string, now: Date): Promise<number> {
    // The same clock as record(): "today" in the learner's time zone.
    const { rows } = await this.pool.query(
      `select d.turns from users u
         join ai_usage_daily d on d.user_id = u.id
          and d.day = ($2::timestamptz at time zone coalesce(u.time_zone, 'UTC'))::date
        where u.id = $1`,
      [userId, now]
    );
    return rows[0]?.turns ?? 0;
  }

  async record(call: CallRecord, now: Date): Promise<void> {
    await inTransaction(this.pool, async (db) => {
      await db.query(
        `insert into ai_calls (user_id, task, provider, model, outcome, input_tokens,
           output_tokens, cache_read_tokens, cache_write_tokens, cost_micro, latency_ms,
           attempts, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)`,
        [
          call.userId,
          call.task,
          call.provider,
          call.model,
          call.outcome,
          call.inputTokens,
          call.outputTokens,
          call.cacheReadTokens,
          call.cacheWriteTokens,
          call.costMicro,
          call.latencyMs,
          JSON.stringify(call.attempts),
          now,
        ]
      );
      if (call.costMicro > 0) {
        await db.query(
          `insert into ai_spend_monthly (month, cost_micro) values ($1, $2)
           on conflict (month) do update
             set cost_micro = ai_spend_monthly.cost_micro + excluded.cost_micro`,
          [monthStart(now), call.costMicro]
        );
      }
      // Tokens and cost of every answered call; a turn only once per learner turn. Failed
      // attempts cost the learner nothing.
      if (call.userId && call.provider) {
        await db.query(
          `insert into ai_usage_daily (user_id, day, turns, tokens, cost_micro)
           select u.id, ($2::timestamptz at time zone coalesce(u.time_zone, 'UTC'))::date,
                  $5, $3, $4
             from users u where u.id = $1
           on conflict (user_id, day) do update
             set turns = ai_usage_daily.turns + excluded.turns,
                 tokens = ai_usage_daily.tokens + excluded.tokens,
                 cost_micro = ai_usage_daily.cost_micro + excluded.cost_micro`,
          [
            call.userId,
            now,
            call.inputTokens +
              call.outputTokens +
              call.cacheReadTokens +
              call.cacheWriteTokens,
            call.costMicro,
            call.turn ? 1 : 0,
          ]
        );
      }
    });
  }

  async usageByTask(since: Date): Promise<TaskUsage[]> {
    const { rows } = await this.pool.query(
      `select task, model, count(*)::int as calls,
              count(*) filter (where provider is null)::int as failed,
              coalesce(sum(input_tokens), 0)::bigint as input_tokens,
              coalesce(sum(output_tokens), 0)::bigint as output_tokens,
              coalesce(sum(cache_read_tokens), 0)::bigint as cache_read_tokens,
              coalesce(sum(cost_micro), 0)::bigint as cost_micro
         from ai_calls where created_at >= $1
        group by task, model order by cost_micro desc, task`,
      [since]
    );
    return rows.map((r) => ({
      task: r.task,
      model: r.model,
      calls: r.calls,
      failed: r.failed,
      inputTokens: Number(r.input_tokens),
      outputTokens: Number(r.output_tokens),
      cacheReadTokens: Number(r.cache_read_tokens),
      costMicro: Number(r.cost_micro),
    }));
  }
}
