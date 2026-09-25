/**
 * Prices in USD per million tokens. $1 per MTok is exactly 1 micro-dollar per token, so cost in
 * micro-dollars is a plain dot product. Verify against the providers' price pages before
 * budgeting (docs/plan/cost-plan.md).
 */
import type { LlmUsage } from './types.js';

export interface Price {
  input: number;
  output: number;
  /** Defaults to the input price (providers without cache discounts). */
  cacheRead?: number;
  cacheWrite?: number;
}

/** Anthropic first-party list prices (cache read ≈ 0.1×, 5-min cache write ≈ 1.25× input). */
export const ANTHROPIC_PRICES: Readonly<Record<string, Price>> = {
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
};

/** Cost of one call in micro-dollars (integer, rounded up so spend is never under-counted). */
export function costMicroUsd(price: Price, usage: LlmUsage): number {
  const micro =
    usage.inputTokens * price.input +
    usage.outputTokens * price.output +
    usage.cacheReadTokens * (price.cacheRead ?? price.input) +
    usage.cacheWriteTokens * (price.cacheWrite ?? price.input);
  return Math.ceil(micro);
}
