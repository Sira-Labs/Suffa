/** Task routing, capabilities, budget modes, fallbacks and the 60-s table cache (story 9.3). */
import { describe, expect, it } from 'vitest';
import {
  costMicroUsd,
  LlmError,
  ModelRouter,
  RouteUnavailableError,
  type LlmProvider,
  type LlmRequest,
  type LlmResult,
  type LlmStreamEvent,
  type ModelRoute,
  type ProviderId,
} from '../src/index.js';

type Outcome = LlmResult['stopReason'] | LlmError | Error;

class ScriptedProvider implements LlmProvider {
  calls: LlmRequest[] = [];
  constructor(
    readonly id: ProviderId,
    private readonly outcomes: Outcome[],
    private readonly failAfterFirstToken = false
  ) {}

  private next(request: LlmRequest): LlmResult {
    this.calls.push(request);
    const outcome = this.outcomes.shift() ?? 'end';
    if (outcome instanceof Error) throw outcome;
    return {
      provider: this.id,
      model: request.model,
      text: `${request.model} says hi`,
      stopReason: outcome,
      toolCalls: [],
      usage: {
        inputTokens: 1000,
        outputTokens: 100,
        cacheReadTokens: 4000,
        cacheWriteTokens: 0,
      },
    };
  }

  async complete(request: LlmRequest) {
    return this.next(request);
  }

  async *stream(request: LlmRequest): AsyncIterable<LlmStreamEvent> {
    if (this.failAfterFirstToken) {
      yield { type: 'text', text: 'partial' };
      throw new LlmError('network', this.id, 'dropped');
    }
    const result = this.next(request);
    yield { type: 'text', text: result.text };
    yield { type: 'done', result };
  }
}

const route = (over: Partial<ModelRoute>): ModelRoute => ({
  task: 'tutor.converse',
  position: 0,
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  effort: 'low',
  maxTokens: 800,
  capabilities: ['streaming', 'structuredOutput', 'tools', 'vision'],
  premium: true,
  enabled: true,
  price: null,
  ...over,
});

const TABLE: ModelRoute[] = [
  route({}),
  route({
    position: 1,
    provider: 'openrouter',
    model: 'qwen/qwen3-235b-a22b',
    effort: null,
    capabilities: ['streaming'],
    premium: false,
    price: { input: 0.2, output: 0.6 },
  }),
  route({ task: 'tutor.coach', model: 'claude-haiku-4-5', premium: false }),
];

const input = { messages: [{ role: 'user' as const, content: 'مرحبا' }] };

function setup(outcomes: Partial<Record<ProviderId, Outcome[]>> = {}, table = TABLE) {
  const anthropic = new ScriptedProvider('anthropic', outcomes.anthropic ?? []);
  const openrouter = new ScriptedProvider('openrouter', outcomes.openrouter ?? []);
  let loads = 0;
  let clock = 0;
  const router = new ModelRouter({
    providers: { anthropic, openrouter },
    source: {
      load: async () => {
        loads += 1;
        return table;
      },
    },
    now: () => clock,
  });
  return {
    router,
    anthropic,
    openrouter,
    loads: () => loads,
    tick: (ms: number) => (clock += ms),
  };
}

describe('ModelRouter', () => {
  it('uses the primary route with its model, effort and max tokens', async () => {
    const { router, anthropic } = setup();
    const result = await router.complete('tutor.converse', { ...input, maxTokens: 2000 });
    expect(anthropic.calls[0]).toMatchObject({
      model: 'claude-sonnet-5',
      effort: 'low',
      maxTokens: 800,
    });
    expect(result).toMatchObject({ provider: 'anthropic', route: { position: 0 } });
    expect(result.attempts).toEqual([
      { provider: 'anthropic', model: 'claude-sonnet-5', outcome: 'ok', latencyMs: 0 },
    ]);
    // 1000 × $2 + 100 × $10 + 4000 × $0.2 per MTok = 3800 µ$
    expect(result.costMicroUsd).toBe(3800);
  });

  it('lowers max tokens on request but never raises them', async () => {
    const { router, anthropic } = setup();
    await router.complete('tutor.converse', { ...input, maxTokens: 100 });
    expect(anthropic.calls[0]!.maxTokens).toBe(100);
  });

  it('falls back on a fallbackable error and on a refusal', async () => {
    const { router, openrouter } = setup({
      anthropic: [new LlmError('overloaded', 'anthropic', 'busy', 529), 'refusal'],
    });
    const first = await router.complete('tutor.converse', input);
    expect(first.provider).toBe('openrouter');
    expect(first.attempts.map((a) => a.outcome)).toEqual(['overloaded', 'ok']);
    expect(openrouter.calls[0]!.effort).toBeUndefined();
    // Open model priced by the route: 1000 × 0.2 + 100 × 0.6 + 4000 × 0.2 = 1060 µ$
    expect(first.costMicroUsd).toBe(1060);
    const second = await router.complete('tutor.converse', input);
    expect(second.attempts.map((a) => a.outcome)).toEqual(['refusal', 'ok']);
  });

  it('returns the refusal of the last route', async () => {
    const { router } = setup({ anthropic: ['refusal'], openrouter: ['refusal'] });
    const result = await router.complete('tutor.converse', input);
    expect(result.stopReason).toBe('refusal');
  });

  it('does not fall back on a bad request or an unknown error', async () => {
    const { router, openrouter } = setup({
      anthropic: [new LlmError('bad_request', 'anthropic', 'bad', 400), new Error('bug')],
    });
    await expect(router.complete('tutor.converse', input)).rejects.toMatchObject({
      kind: 'bad_request',
    });
    await expect(router.complete('tutor.converse', input)).rejects.toThrow('bug');
    expect(openrouter.calls).toHaveLength(0);
  });

  it('reports every attempt when all routes fail', async () => {
    const { router } = setup({
      anthropic: [new LlmError('rate_limited', 'anthropic', 'slow down', 429)],
      openrouter: [new LlmError('server', 'openrouter', 'down', 500)],
    });
    const error = await router.complete('tutor.converse', input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RouteUnavailableError);
    expect(error).toMatchObject({
      reason: 'all_failed',
      attempts: [{ outcome: 'rate_limited' }, { outcome: 'server' }],
    });
  });

  it('skips routes lacking a required capability, including structured output', async () => {
    const { router } = setup({
      anthropic: [new LlmError('server', 'anthropic', 'x', 500)],
    });
    await expect(
      router.complete('tutor.converse', { ...input, jsonSchema: { type: 'object' } })
    ).rejects.toMatchObject({
      reason: 'all_failed',
      attempts: [{ provider: 'anthropic' }],
    });
    expect(await router.plan('tutor.converse', { requires: ['vision'] })).toHaveLength(1);
  });

  it('skips disabled routes and providers that are not configured', async () => {
    const table = [
      route({ enabled: false }),
      route({ position: 1, provider: 'huggingface', model: 'x' }),
      route({ position: 2, model: 'claude-haiku-4-5' }),
    ];
    const { router } = setup({}, table);
    expect((await router.plan('tutor.converse')).map((r) => r.model)).toEqual([
      'claude-haiku-4-5',
    ]);
    await expect(router.complete('grade.writing', input)).rejects.toMatchObject({
      reason: 'no_route',
    });
  });

  it('downgrades to economy routes at 80 % and stops at 100 %', async () => {
    const { router } = setup();
    expect(
      (await router.plan('tutor.converse', { mode: 'economy' })).map((r) => r.provider)
    ).toEqual(['openrouter']);
    // A task with only premium routes keeps them rather than failing.
    const premiumOnly = setup({}, [route({ task: 'content.author-assist' })]);
    expect(
      await premiumOnly.router.plan('content.author-assist', { mode: 'economy' })
    ).toHaveLength(1);
    await expect(
      router.complete('tutor.converse', input, { mode: 'exhausted' })
    ).rejects.toMatchObject({ reason: 'budget_exhausted' });
  });

  it('caches the table for 60 s, reloads after, and survives a failed reload', async () => {
    let fail = false;
    let loads = 0;
    let clock = 0;
    const router = new ModelRouter({
      providers: { anthropic: new ScriptedProvider('anthropic', []) },
      source: {
        load: async () => {
          loads += 1;
          if (fail) throw new Error('db down');
          return TABLE;
        },
      },
      now: () => clock,
    });
    await router.plan('tutor.converse');
    clock = 59_999;
    await router.plan('tutor.converse');
    expect(loads).toBe(1);
    clock = 60_000;
    await router.plan('tutor.converse');
    expect(loads).toBe(2);
    fail = true;
    clock = 200_000;
    expect(await router.plan('tutor.converse')).toHaveLength(1);
    router.invalidate();
    await expect(router.plan('tutor.converse')).rejects.toThrow('db down');
  });

  it('streams with fallback before the first token', async () => {
    const { router } = setup({
      anthropic: [new LlmError('overloaded', 'anthropic', 'busy', 529)],
    });
    const events: string[] = [];
    let done: unknown;
    for await (const e of router.stream('tutor.converse', input)) {
      if (e.type === 'text') events.push(e.text);
      else done = e.result;
    }
    expect(events).toEqual(['qwen/qwen3-235b-a22b says hi']);
    expect(done).toMatchObject({
      provider: 'openrouter',
      attempts: [{}, { outcome: 'ok' }],
    });
  });

  it('does not fall back once tokens were streamed', async () => {
    const broken = new ScriptedProvider('anthropic', [], true);
    const router = new ModelRouter({
      providers: {
        anthropic: broken,
        openrouter: new ScriptedProvider('openrouter', []),
      },
      source: { load: async () => TABLE },
    });
    const seen: string[] = [];
    await expect(
      (async () => {
        for await (const e of router.stream('tutor.converse', input)) {
          if (e.type === 'text') seen.push(e.text);
        }
      })()
    ).rejects.toMatchObject({ kind: 'network' });
    expect(seen).toEqual(['partial']);
  });

  it('fails the stream when every route fails before a token', async () => {
    const { router } = setup({
      anthropic: [new LlmError('server', 'anthropic', 'x', 500)],
      openrouter: [new LlmError('server', 'openrouter', 'x', 500)],
    });
    await expect(
      (async () => {
        for await (const e of router.stream('tutor.converse', input)) void e;
      })()
    ).rejects.toBeInstanceOf(RouteUnavailableError);
  });

  it('reports no cost for a model without a price', async () => {
    const { router } = setup({}, [route({ model: 'claude-future-9' })]);
    expect((await router.complete('tutor.converse', input)).costMicroUsd).toBeNull();
  });
});

describe('costMicroUsd', () => {
  it('prices every token class and rounds up', () => {
    expect(
      costMicroUsd(
        { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
        { inputTokens: 3, outputTokens: 1, cacheReadTokens: 5, cacheWriteTokens: 1 }
      )
    ).toBe(Math.ceil(3 + 5 + 0.5 + 1.25));
    expect(
      costMicroUsd(
        { input: 2, output: 4 },
        { inputTokens: 1, outputTokens: 1, cacheReadTokens: 1, cacheWriteTokens: 1 }
      )
    ).toBe(10);
  });
});
