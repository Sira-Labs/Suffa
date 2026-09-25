/**
 * Shared contract suite (stories 9.1, 9.2): every adapter must turn its provider's wire format
 * into the same neutral results, usage and error kinds.
 */
import { describe, expect, it } from 'vitest';
import {
  AnthropicProvider,
  huggingFaceProvider,
  LlmError,
  openRouterProvider,
  type LlmProvider,
  type LlmStreamEvent,
} from '../src/index.js';
import { fakeFetch, type Script } from './fakeFetch.js';
import {
  anthropicWire,
  openAiWire,
  type Scenario,
  type WireFixtures,
} from './fixtures.js';

interface Subject {
  name: string;
  model: string;
  wire: WireFixtures;
  make(fetchImpl: typeof fetch): LlmProvider;
}

const subjects: Subject[] = [
  {
    name: 'anthropic',
    model: 'claude-sonnet-5',
    wire: anthropicWire,
    make: (f) => new AnthropicProvider({ apiKey: 'test-key', maxRetries: 0, fetch: f }),
  },
  {
    name: 'openrouter',
    model: 'qwen/qwen3-235b-a22b',
    wire: openAiWire,
    make: (f) => openRouterProvider({ apiKey: 'test-key', fetch: f }),
  },
  {
    name: 'huggingface',
    model: 'meta-llama/Llama-3.3-70B-Instruct',
    wire: openAiWire,
    make: (f) => huggingFaceProvider({ apiKey: 'test-key', fetch: f }),
  },
];

const request = (model: string) => ({
  model,
  system: [
    { text: 'Du bist al-Muʿallim.', cache: true },
    { text: 'Lernstand: Einheit 3' },
  ],
  messages: [{ role: 'user' as const, content: 'Was heißt كتاب?' }],
  maxTokens: 400,
});

async function collect(events: AsyncIterable<LlmStreamEvent>) {
  const all: LlmStreamEvent[] = [];
  for await (const e of events) all.push(e);
  return all;
}

describe.each(subjects)('$name adapter', (subject) => {
  const scenario: Scenario = {
    model: subject.model,
    pieces: ['كتاب', ' heißt ', 'Buch.'],
    input: 120,
    output: 9,
    cacheRead: 4000,
    cacheWrite: subject.wire.reportsCacheWrites ? 30 : 0,
    finish: 'end',
  };
  const provider = (scripts: Script[]) => {
    const fake = fakeFetch(scripts);
    return { p: subject.make(fake.fetch), requests: fake.requests };
  };

  it('completes with text, stop reason and usage incl. cache reads', async () => {
    const { p } = provider([subject.wire.complete(scenario)]);
    const result = await p.complete(request(subject.model));
    expect(result).toEqual({
      provider: subject.name,
      model: subject.model,
      text: 'كتاب heißt Buch.',
      stopReason: 'end',
      usage: {
        inputTokens: 120,
        outputTokens: 9,
        cacheReadTokens: 4000,
        cacheWriteTokens: scenario.cacheWrite,
      },
    });
  });

  it('streams deltas and ends with one done event carrying the same result', async () => {
    const { p } = provider([subject.wire.stream(scenario)]);
    const events = await collect(p.stream(request(subject.model)));
    expect(
      events.filter((e) => e.type === 'text').map((e) => e.type === 'text' && e.text)
    ).toEqual(scenario.pieces);
    const done = events.at(-1);
    expect(events.filter((e) => e.type === 'done')).toHaveLength(1);
    expect(done).toMatchObject({
      type: 'done',
      result: {
        text: 'كتاب heißt Buch.',
        stopReason: 'end',
        usage: { inputTokens: 120, outputTokens: 9, cacheReadTokens: 4000 },
      },
    });
  });

  it.each([
    ['max_tokens', 'max_tokens'],
    ['refusal', 'refusal'],
  ] as const)('maps the %s finish reason', async (finish, expected) => {
    const { p } = provider([subject.wire.complete({ ...scenario, finish })]);
    expect((await p.complete(request(subject.model))).stopReason).toBe(expected);
  });

  it.each([
    [429, 'rate_limited', true],
    [401, 'auth', true],
    [404, 'not_found', true],
    [400, 'bad_request', false],
    [500, 'server', true],
    [529, 'overloaded', true],
  ] as const)('maps HTTP %i to %s', async (status, kind, fallbackable) => {
    const { p } = provider([subject.wire.error(status)]);
    const error = await p.complete(request(subject.model)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({ kind, provider: subject.name, fallbackable });
  });

  it('maps a failed connection to network', async () => {
    const { p } = provider([new TypeError('fetch failed')]);
    await expect(p.complete(request(subject.model))).rejects.toMatchObject({
      kind: 'network',
    });
  });

  it('maps a caller abort to aborted (not fallbackable)', async () => {
    const { p } = provider([subject.wire.complete(scenario)]);
    const controller = new AbortController();
    controller.abort();
    const error = await p
      .complete({ ...request(subject.model), signal: controller.signal })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'aborted', fallbackable: false });
  });

  it('errors on a stream are typed too', async () => {
    const { p } = provider([subject.wire.error(503)]);
    await expect(collect(p.stream(request(subject.model)))).rejects.toMatchObject({
      kind: 'overloaded',
    });
  });

  it('sends a structured-output schema', async () => {
    const { p, requests } = provider([subject.wire.complete(scenario)]);
    const schema = {
      type: 'object',
      properties: { score: { type: 'integer' } },
      required: ['score'],
      additionalProperties: false,
    };
    await p.complete({ ...request(subject.model), jsonSchema: schema });
    expect(JSON.stringify(requests[0]!.body)).toContain('"score"');
  });

  it('never leaks the key into the body', async () => {
    const { p, requests } = provider([subject.wire.complete(scenario)]);
    await p.complete(request(subject.model));
    expect(JSON.stringify(requests[0]!.body)).not.toContain('test-key');
  });
});
