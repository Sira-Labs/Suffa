/**
 * Live check of prompt caching against the real API (story 9.1 acceptance). Skipped unless
 * SUFFA_LLM_LIVE_ANTHROPIC_KEY is set; costs well under a cent with Haiku.
 */
import { describe, expect, it } from 'vitest';
import { AnthropicProvider } from '../src/index.js';

const key = process.env.SUFFA_LLM_LIVE_ANTHROPIC_KEY;

describe.skipIf(!key)('Anthropic live', () => {
  it('reads the stable prefix from the cache on the second call', async () => {
    const provider = new AnthropicProvider({ apiKey: key! });
    // Above the minimum cacheable prefix of every current model; byte-identical per run.
    const pack = Array.from(
      { length: 900 },
      (_, i) => `Vokabel ${i}: كتاب (kitāb) – Buch; Plural كتب (kutub).`
    ).join('\n');
    const call = () =>
      provider.complete({
        model: 'claude-haiku-4-5',
        system: [{ text: `Du bist ein Arabischlehrer.\n${pack}`, cache: true }],
        messages: [{ role: 'user', content: 'Antworte nur mit: ok' }],
        maxTokens: 10,
      });
    const first = await call();
    const second = await call();
    expect(first.usage.cacheWriteTokens + first.usage.cacheReadTokens).toBeGreaterThan(0);
    expect(second.usage.cacheReadTokens).toBeGreaterThan(0);
  }, 60_000);
});
