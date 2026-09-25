/** Anthropic specifics: cache breakpoint placement, effort, structured output (story 9.1). */
import { describe, expect, it } from 'vitest';
import {
  AnthropicProvider,
  kindForStatus,
  LlmError,
  supportsEffort,
  toLlmError,
} from '../src/index.js';
import { fakeFetch } from './fakeFetch.js';
import { anthropicWire } from './fixtures.js';

const ok = () =>
  anthropicWire.complete({
    model: 'claude-sonnet-5',
    pieces: ['ok'],
    input: 1,
    output: 1,
    cacheRead: 0,
    cacheWrite: 0,
    finish: 'end',
  });

function subject() {
  const fake = fakeFetch([ok()]);
  return {
    provider: new AnthropicProvider({ apiKey: 'k', maxRetries: 0, fetch: fake.fetch }),
    requests: fake.requests,
  };
}

describe('AnthropicProvider request', () => {
  it('puts one cache breakpoint after the last stable system part', async () => {
    const { provider, requests } = subject();
    await provider.complete({
      model: 'claude-sonnet-5',
      system: [
        { text: 'persona', cache: true },
        { text: 'curriculum pack', cache: true },
        { text: 'learner snapshot' },
      ],
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 300,
      effort: 'low',
    });
    const body = requests[0]!.body;
    expect(body.system).toEqual([
      { type: 'text', text: 'persona' },
      { type: 'text', text: 'curriculum pack', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'learner snapshot' },
    ]);
    expect(body.output_config).toEqual({ effort: 'low' });
    expect(body.max_tokens).toBe(300);
    expect(requests[0]!.headers['x-api-key']).toBe('k');
  });

  it('omits effort for Haiku and sends a JSON schema as output format', async () => {
    const { provider, requests } = subject();
    const schema = { type: 'object', properties: {}, additionalProperties: false };
    await provider.complete({
      model: 'claude-haiku-4-5',
      messages: [{ role: 'user', content: 'grade' }],
      maxTokens: 200,
      effort: 'low',
      jsonSchema: schema,
    });
    const body = requests[0]!.body;
    expect(body.output_config).toEqual({ format: { type: 'json_schema', schema } });
    expect(body.system).toBeUndefined();
  });

  it('sends no output_config when nothing is asked for', async () => {
    const { provider, requests } = subject();
    await provider.complete({
      model: 'claude-sonnet-5',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 100,
    });
    expect(requests[0]!.body.output_config).toBeUndefined();
  });

  it('knows which models take effort', () => {
    expect(supportsEffort('claude-sonnet-5')).toBe(true);
    expect(supportsEffort('claude-opus-5')).toBe(true);
    expect(supportsEffort('claude-haiku-4-5')).toBe(false);
  });
});

describe('AnthropicProvider errors', () => {
  it('maps an SDK timeout to timeout', async () => {
    const hanging = ((_url: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError'))
        );
      })) as typeof fetch;
    const provider = new AnthropicProvider({
      apiKey: 'k',
      maxRetries: 0,
      timeoutMs: 20,
      fetch: hanging,
    });
    await expect(
      provider.complete({ model: 'claude-sonnet-5', messages: [], maxTokens: 1 })
    ).rejects.toMatchObject({ kind: 'timeout', fallbackable: true });
  });

  it('passes through errors that are not API errors', async () => {
    expect(toLlmError(new RangeError('bug'))).toBeInstanceOf(RangeError);
    const typed = new LlmError('server', 'anthropic', 'x');
    expect(toLlmError(typed)).toBe(typed);
  });
});

describe('kindForStatus', () => {
  it('maps request timeouts and other client errors', () => {
    expect(kindForStatus(408)).toBe('timeout');
    expect(kindForStatus(413)).toBe('bad_request');
    expect(kindForStatus(403)).toBe('auth');
  });
});
