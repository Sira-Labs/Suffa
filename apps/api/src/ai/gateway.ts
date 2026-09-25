/**
 * The one door to the language models (ADR-0010). Before a call: the learner's daily quota and
 * the global monthly budget (≥ downgrade % → economy routes, ≥ 100 % → AI paused). After it:
 * one metering row with tokens incl. cache reads, cost and latency — also for failures.
 */
import {
  RouteUnavailableError,
  type BudgetMode,
  type Capability,
  type ModelRouter,
  type RoutedResult,
  type RoutedStreamEvent,
  type TaskInput,
} from '@suffa/llm';
import type { Logger } from 'pino';
import type { Actor } from '../authz/policies.js';
import type { AiRepository, AiSettings, CallRecord } from './repository.js';

/** The learner used up today's turns. */
export class AiQuotaError extends Error {
  constructor(
    readonly used: number,
    readonly limit: number
  ) {
    super(`daily AI quota reached (${used}/${limit})`);
    this.name = 'AiQuotaError';
  }
}

export interface BudgetState {
  mode: BudgetMode;
  spentMicro: number;
  budgetMicro: number;
}

export function budgetMode(spent: number, settings: AiSettings): BudgetMode {
  const budget = settings.monthlyBudgetMicro;
  if (spent >= budget) return 'exhausted';
  if (spent >= (budget * settings.downgradePercent) / 100) return 'economy';
  return 'normal';
}

export interface AiGatewayDeps {
  router: ModelRouter;
  repo: AiRepository;
  log: Pick<Logger, 'info' | 'warn'>;
  now?: () => Date;
}

export class AiGateway {
  private readonly now: () => Date;

  constructor(private readonly deps: AiGatewayDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async budget(): Promise<BudgetState> {
    const [settings, spent] = await Promise.all([
      this.deps.repo.settings(),
      this.deps.repo.monthSpend(this.now()),
    ]);
    return {
      mode: budgetMode(spent, settings),
      spentMicro: spent,
      budgetMicro: settings.monthlyBudgetMicro,
    };
  }

  async complete(
    actor: Actor,
    task: string,
    input: TaskInput,
    requires: Capability[] = []
  ): Promise<RoutedResult> {
    const mode = await this.admit(actor, task);
    try {
      const result = await this.deps.router.complete(task, input, { mode, requires });
      await this.meter(actor, task, result);
      return result;
    } catch (error) {
      await this.meterFailure(actor, task, error);
      throw error;
    }
  }

  async *stream(
    actor: Actor,
    task: string,
    input: TaskInput,
    requires: Capability[] = []
  ): AsyncIterable<RoutedStreamEvent> {
    const mode = await this.admit(actor, task);
    try {
      for await (const event of this.deps.router.stream(task, input, {
        mode,
        requires,
      })) {
        if (event.type === 'done') await this.meter(actor, task, event.result);
        yield event;
      }
    } catch (error) {
      await this.meterFailure(actor, task, error);
      throw error;
    }
  }

  /** Quota first (per learner), then the budget; returns the routing mode. */
  private async admit(actor: Actor, task: string): Promise<BudgetMode> {
    const settings = await this.deps.repo.settings();
    const limit = settings.dailyTurns[actor.role];
    if (limit !== null) {
      const used = await this.deps.repo.turnsToday(actor.id);
      if (used >= limit) {
        this.deps.log.info({ userId: actor.id, task, used, limit }, 'ai.quota_reached');
        throw new AiQuotaError(used, limit);
      }
    }
    const spent = await this.deps.repo.monthSpend(this.now());
    const mode = budgetMode(spent, settings);
    if (mode === 'exhausted') {
      await this.write(this.empty(actor, task, 'paused'));
      throw new RouteUnavailableError(task, 'budget_exhausted');
    }
    return mode;
  }

  private async meter(actor: Actor, task: string, result: RoutedResult) {
    if (result.costMicroUsd === null) {
      this.deps.log.warn({ model: result.route.model, task }, 'ai.unpriced_model');
    }
    await this.write({
      userId: actor.id,
      task,
      provider: result.provider,
      model: result.model,
      outcome: result.stopReason === 'refusal' ? 'refusal' : 'ok',
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cacheReadTokens: result.usage.cacheReadTokens,
      cacheWriteTokens: result.usage.cacheWriteTokens,
      costMicro: result.costMicroUsd ?? 0,
      latencyMs: result.latencyMs,
      attempts: result.attempts,
    });
  }

  private async meterFailure(actor: Actor, task: string, error: unknown) {
    const record = this.empty(actor, task, 'unavailable');
    if (error instanceof RouteUnavailableError) record.attempts = error.attempts;
    this.deps.log.warn({ task, err: error }, 'ai.call_failed');
    await this.write(record);
  }

  private empty(actor: Actor, task: string, outcome: string): CallRecord {
    return {
      userId: actor.id,
      task,
      provider: null,
      model: null,
      outcome,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costMicro: 0,
      latencyMs: 0,
      attempts: [],
    };
  }

  /** Metering must never turn a served answer into an error. */
  private async write(record: CallRecord) {
    try {
      await this.deps.repo.record(record, this.now());
    } catch (error) {
      this.deps.log.warn({ err: error, task: record.task }, 'ai.metering_failed');
    }
  }
}
