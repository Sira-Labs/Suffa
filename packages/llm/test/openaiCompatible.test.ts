/** OpenRouter / Hugging Face specifics: endpoints, headers, system prompt, SSE edge cases. */
import { describe, expect, it } from 'vitest';
import { huggingFaceProvider, openRouterProvider, readSse } from '../src/index.js';
import { fakeFetch, json } from './fakeFetch.js';

const ok = () =>
  json({ model: 'm', choices: [{ message: { content: 'x' }, finish_reason: 'stop' }] });

describe('OpenAI-compatible adapters', () => {
  it('OpenRouter posts to its API with attribution headers and a joined system prompt', async () => {
    const fake = fakeFetch([ok()]);
    const p = openRouterProvider({
      apiKey: 'k',
      appUrl: 'https://suffa.example',
      fetch: fake.fetch,
    });
    const result = await p.complete({
      model: 'm',
      system: [{ text: 'A', cache: true }, { text: 'B' }],
      messages: [{ role: 'user', content: 'q' }],
      maxTokens: 50,
    });
    const r = fake.requests[0]!;
    expect(r.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(r.headers).toMatchObject({
      authorization: 'Bearer k',
      'x-title': 'Suffa',
      'http-referer': 'https://suffa.example',
    });
    expect(r.body.messages).toEqual([
      { role: 'system', content: 'A\n\nB' },
      { role: 'user', content: 'q' },
    ]);
    expect(result.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
  });

  it('Hugging Face uses the router by default or a dedicated endpoint', async () => {
    const fake = fakeFetch([ok(), ok()]);
    await huggingFaceProvider({ apiKey: 'k', fetch: fake.fetch }).complete({
      model: 'm',
      messages: [{ role: 'user', content: 'q' }],
      maxTokens: 5,
    });
    await huggingFaceProvider({
      apiKey: 'k',
      endpointUrl: 'https://abc.endpoints.huggingface.cloud/',
      fetch: fake.fetch,
    }).complete({ model: 'm', messages: [{ role: 'user', content: 'q' }], maxTokens: 5 });
    expect(fake.requests.map((r) => r.url)).toEqual([
      'https://router.huggingface.co/v1/chat/completions',
      'https://abc.endpoints.huggingface.cloud/v1/chat/completions',
    ]);
    expect(fake.requests[0]!.body.messages).toEqual([{ role: 'user', content: 'q' }]);
  });

  it('treats a timeout as timeout', async () => {
    const fake = fakeFetch([new DOMException('timed out', 'TimeoutError')]);
    const p = openRouterProvider({ apiKey: 'k', fetch: fake.fetch, timeoutMs: 5 });
    await expect(
      p.complete({ model: 'm', messages: [{ role: 'user', content: 'q' }], maxTokens: 5 })
    ).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('reads SSE split across chunks, CRLF and a final event without a blank line', async () => {
    const encoder = new TextEncoder();
    const parts = [
      'data: {"a"',
      ':1}\r\n\r\nevent: x\ndata: one\ndata: two\n\n',
      'data: last',
    ];
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const p of parts) c.enqueue(encoder.encode(p));
        c.close();
      },
    });
    const out: string[] = [];
    for await (const d of readSse(body)) out.push(d);
    expect(out).toEqual(['{"a":1}', 'one\ntwo', 'last']);
  });
});

describe('OpenAI-compatible stream errors', () => {
  it('surfaces a malformed chunk as a parse error, not a provider outage', async () => {
    const fake = fakeFetch([
      new Response('data: {"choices":[{"delta":{"content":"a"}}]}\n\ndata: {oops\n\n'),
    ]);
    const p = openRouterProvider({ apiKey: 'k', fetch: fake.fetch });
    const seen: string[] = [];
    await expect(
      (async () => {
        for await (const e of p.stream({ model: 'm', messages: [], maxTokens: 5 })) {
          if (e.type === 'text') seen.push(e.text);
        }
      })()
    ).rejects.toBeInstanceOf(SyntaxError);
    expect(seen).toEqual(['a']);
  });

  it('ends a stream without finish reason or usage gracefully', async () => {
    const fake = fakeFetch([new Response('data: {"choices":[{"delta":{}}]}\n\n')]);
    const p = huggingFaceProvider({ apiKey: 'k', fetch: fake.fetch });
    const events = [];
    for await (const e of p.stream({ model: 'm', messages: [], maxTokens: 5 }))
      events.push(e);
    expect(events).toEqual([
      {
        type: 'done',
        result: {
          provider: 'huggingface',
          model: 'm',
          text: '',
          stopReason: 'other',
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
        },
      },
    ]);
  });
});
