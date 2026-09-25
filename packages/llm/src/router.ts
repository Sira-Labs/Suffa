/**
 * Task → model routing (ADR-0010). Callers name a task; the router loads the route table
 * (cached for `ttlMs`, so an admin change is live within a minute), keeps only routes whose
 * provider is configured and whose model declares the needed capabilities, and tries them in
 * order. A fallbackable error or a refusal moves on to the next route; a stream can only fall
 * back before its first token.
 */
import { LlmError, type LlmErrorKind } from './errors.js';
import { ANTHROPIC_PRICES, costMicroUsd, type Price } from './pricing.js';
import type {
  Capability,
  Effort,
  LlmProvider,
  LlmRequest,
  LlmResult,
  ProviderId,
} from './types.js';

export interface ModelRoute {
  task: string;
  /** 0 = primary, higher = later fallback. */
  position: number;
  provider: ProviderId;
  model: string;
  effort: Effort | null;
  maxTokens: number;
  capabilities: Capability[];
  /** Premium routes are skipped while the budget is in economy mode. */
  premium: boolean;
  enabled: boolean;
  /** Overrides the built-in price list (open models on OpenRouter / Hugging Face). */
  price: Price | null;
}

export interface RouteSource {
  load(): Promise<ModelRoute[]>;
}

/** normal: all routes; economy (≥ 80 % of budget): cheap routes first; exhausted: no calls. */
export type BudgetMode = 'normal' | 'economy' | 'exhausted';

export type TaskInput = Omit<LlmRequest, 'model' | 'maxTokens' | 'effort'> & {
  /** Caps the route's max tokens (never raises it). */
  maxTokens?: number;
};

export interface RouteOptions {
  requires?: Capability[];
  mode?: BudgetMode;
}

export interface Attempt {
  provider: ProviderId;
  model: string;
  outcome: 'ok' | 'refusal' | LlmErrorKind;
  latencyMs: number;
}

export interface RoutedResult extends LlmResult {
  route: ModelRoute;
  /** Null when the model has no known price (logged, counted as 0). */
  costMicroUsd: number | null;
  latencyMs: number;
  attempts: Attempt[];
}

export type RoutedStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'done'; result: RoutedResult };

export class RouteUnavailableError extends Error {
  constructor(
    readonly task: string,
    readonly reason: 'no_route' | 'budget_exhausted' | 'all_failed',
    readonly attempts: Attempt[] = [],
    options?: { cause?: unknown }
  ) {
    super(`no model available for ${task} (${reason})`, options);
    this.name = 'RouteUnavailableError';
  }
}

export interface ModelRouterDeps {
  providers: Partial<Record<ProviderId, LlmProvider>>;
  source: RouteSource;
  ttlMs?: number;
  now?: () => number;
}

export function priceOf(route: ModelRoute): Price | null {
  return route.price ?? ANTHROPIC_PRICES[route.model] ?? null;
}

export class ModelRouter {
  private cache: { at: number; routes: ModelRoute[] } | null = null;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(private readonly deps: ModelRouterDeps) {
    this.ttlMs = deps.ttlMs ?? 60_000;
    this.now = deps.now ?? Date.now;
  }

  /** Forces the next call to reload the table (after an admin edit on this instance). */
  invalidate(): void {
    this.cache = null;
  }

  async routes(): Promise<ModelRoute[]> {
    const now = this.now();
    if (this.cache && now - this.cache.at < this.ttlMs) return this.cache.routes;
    try {
      const routes = await this.deps.source.load();
      this.cache = { at: now, routes };
      return routes;
    } catch (error) {
      // A database hiccup should not switch AI off: keep serving the last known table.
      if (this.cache) return this.cache.routes;
      throw error;
    }
  }

  /** The routes a call would try, in order. */
  async plan(task: string, options: RouteOptions = {}): Promise<ModelRoute[]> {
    const requires = options.requires ?? [];
    const usable = (await this.routes())
      .filter(
        (r) =>
          r.task === task &&
          r.enabled &&
          this.deps.providers[r.provider] !== undefined &&
          requires.every((c) => r.capabilities.includes(c))
      )
      .sort((a, b) => a.position - b.position);
    if (options.mode !== 'economy') return usable;
    const economy = usable.filter((r) => !r.premium);
    return economy.length > 0 ? economy : usable;
  }

  async complete(
    task: string,
    input: TaskInput,
    options: RouteOptions = {}
  ): Promise<RoutedResult> {
    const routes = await this.candidates(task, input, options);
    const attempts: Attempt[] = [];
    let lastError: unknown;
    for (const [i, route] of routes.entries()) {
      const started = this.now();
      try {
        const result = await this.provider(route).complete(request(route, input));
        const latencyMs = this.now() - started;
        const refused = result.stopReason === 'refusal';
        attempts.push(attempt(route, refused ? 'refusal' : 'ok', latencyMs));
        if (refused && i < routes.length - 1) continue;
        return routed(result, route, latencyMs, attempts);
      } catch (error) {
        attempts.push(attempt(route, kindOf(error), this.now() - started));
        if (!(error instanceof LlmError) || !error.fallbackable) throw error;
        lastError = error;
      }
    }
    throw new RouteUnavailableError(task, 'all_failed', attempts, { cause: lastError });
  }

  async *stream(
    task: string,
    input: TaskInput,
    options: RouteOptions = {}
  ): AsyncIterable<RoutedStreamEvent> {
    const routes = await this.candidates(task, input, {
      ...options,
      requires: [...(options.requires ?? []), 'streaming'],
    });
    const attempts: Attempt[] = [];
    let lastError: unknown;
    for (const route of routes) {
      const started = this.now();
      let emitted = false;
      try {
        for await (const event of this.provider(route).stream(request(route, input))) {
          if (event.type === 'text') {
            emitted = true;
            yield event;
          } else {
            const latencyMs = this.now() - started;
            const refused = event.result.stopReason === 'refusal';
            attempts.push(attempt(route, refused ? 'refusal' : 'ok', latencyMs));
            yield {
              type: 'done',
              result: routed(event.result, route, latencyMs, attempts),
            };
            return;
          }
        }
      } catch (error) {
        attempts.push(attempt(route, kindOf(error), this.now() - started));
        if (emitted || !(error instanceof LlmError) || !error.fallbackable) throw error;
        lastError = error;
      }
    }
    throw new RouteUnavailableError(task, 'all_failed', attempts, { cause: lastError });
  }

  private async candidates(task: string, input: TaskInput, options: RouteOptions) {
    if (options.mode === 'exhausted')
      throw new RouteUnavailableError(task, 'budget_exhausted');
    const requires = new Set(options.requires ?? []);
    if (input.jsonSchema) requires.add('structuredOutput');
    const routes = await this.plan(task, { ...options, requires: [...requires] });
    if (routes.length === 0) throw new RouteUnavailableError(task, 'no_route');
    return routes;
  }

  private provider(route: ModelRoute): LlmProvider {
    return this.deps.providers[route.provider]!;
  }
}

function request(route: ModelRoute, input: TaskInput): LlmRequest {
  const { maxTokens, ...rest } = input;
  return {
    ...rest,
    model: route.model,
    maxTokens: Math.min(route.maxTokens, maxTokens ?? route.maxTokens),
    ...(route.effort ? { effort: route.effort } : {}),
  };
}

function kindOf(error: unknown): Attempt['outcome'] {
  return error instanceof LlmError ? error.kind : 'server';
}

function attempt(
  route: ModelRoute,
  outcome: Attempt['outcome'],
  latencyMs: number
): Attempt {
  return { provider: route.provider, model: route.model, outcome, latencyMs };
}

function routed(
  result: LlmResult,
  route: ModelRoute,
  latencyMs: number,
  attempts: Attempt[]
): RoutedResult {
  const price = priceOf(route);
  return {
    ...result,
    route,
    costMicroUsd: price ? costMicroUsd(price, result.usage) : null,
    latencyMs,
    attempts,
  };
}
