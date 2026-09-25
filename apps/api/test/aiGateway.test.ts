/** Budget modes, friendly errors and provider setup of the AI gateway (story 9.4). */
import { LlmError, RouteUnavailableError } from '@suffa/llm';
import { describe, expect, it } from 'vitest';
import { aiErrorResponse } from '../src/ai/errors.js';
import { AiQuotaError, budgetMode } from '../src/ai/gateway.js';
import { buildProviders } from '../src/ai/providers.js';

const settings = (budget: number) => ({
  monthlyBudgetMicro: budget,
  downgradePercent: 80,
  dailyTurns: { student: 30, teacher: 100, admin: null },
});

describe('budgetMode', () => {
  it('is normal below the threshold, economy from it, exhausted at the budget', () => {
    expect(budgetMode(79, settings(100))).toBe('normal');
    expect(budgetMode(80, settings(100))).toBe('economy');
    expect(budgetMode(100, settings(100))).toBe('exhausted');
    // A zero budget switches AI off.
    expect(budgetMode(0, settings(0))).toBe('exhausted');
  });
});

describe('aiErrorResponse', () => {
  it('answers the quota with 429 and a calm German sentence', () => {
    const r = aiErrorResponse(new AiQuotaError(30, 30));
    expect(r?.status).toBe(429);
    expect(r?.body).toMatchObject({ error: 'ai_quota', limit: 30 });
    expect(r?.body.message).toContain('Morgen');
  });

  it('separates a paused budget from an outage', () => {
    expect(
      aiErrorResponse(new RouteUnavailableError('t.x', 'budget_exhausted'))?.body.error
    ).toBe('ai_paused');
    expect(
      aiErrorResponse(new RouteUnavailableError('t.x', 'all_failed'))?.body.error
    ).toBe('ai_unavailable');
    expect(aiErrorResponse(new RouteUnavailableError('t.x', 'no_route'))?.status).toBe(
      503
    );
  });

  it('maps a bad request to 400 and leaves other errors to the error handler', () => {
    expect(
      aiErrorResponse(new LlmError('bad_request', 'anthropic', 'x', 400))?.status
    ).toBe(400);
    expect(aiErrorResponse(new LlmError('server', 'anthropic', 'x', 500))).toBeNull();
    expect(aiErrorResponse(new Error('bug'))).toBeNull();
  });
});

describe('buildProviders', () => {
  const ai = {
    anthropicKey: undefined,
    openRouterKey: undefined,
    huggingFaceKey: undefined,
    huggingFaceEndpoint: undefined,
  };

  it('turns on exactly the providers that have a key', () => {
    expect(Object.keys(buildProviders({ ai, publicUrl: undefined }))).toEqual([]);
    const all = buildProviders({
      ai: {
        anthropicKey: 'a',
        openRouterKey: 'o',
        huggingFaceKey: 'h',
        huggingFaceEndpoint: undefined,
      },
      publicUrl: 'https://suffa.example',
    });
    expect(Object.keys(all).sort()).toEqual(['anthropic', 'huggingface', 'openrouter']);
    expect(
      Object.values(all)
        .map((p) => p.id)
        .sort()
    ).toEqual(['anthropic', 'huggingface', 'openrouter']);
  });
});
