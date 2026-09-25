/**
 * Tool calls (Sprint 10): every adapter reports the model's tool calls, sends tool specs and
 * results in its wire format, and an Anthropic turn is replayed exactly as received.
 */
import { describe, expect, it } from 'vitest';
import {
  AnthropicProvider,
  huggingFaceProvider,
  openRouterProvider,
  type LlmMessage,
  type LlmStreamEvent,
  type ToolSpec,
} from '../src/index.js';
import { fakeFetch, json, sse } from './fakeFetch.js';

const LOOKUP: ToolSpec = {
  name: 'lookup_vocab',
  description: 'Find words of the course.',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
    additionalProperties: false,
  },
};

const anthropicContent = [
  { type: 'thinking', thinking: '', signature: 'sig-abc' },
  { type: 'text', text: 'Ich schaue nach.' },
  {
    type: 'tool_use',
    id: 'toolu_1',
    name: 'lookup_vocab',
    input: { query: 'كتاب' },
    caller: { type: 'direct' },
  },
];

const anthropicToolUse = (stop = 'tool_use') =>
  json({
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5',
    content: anthropicContent,
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
  });

const history = (replay: LlmMessage): LlmMessage[] => [
  { role: 'user', content: 'Was heißt كتاب?' },
  replay,
  { role: 'tool', results: [{ callId: 'toolu_1', content: '{"de":"Buch"}' }] },
];

async function collect(events: AsyncIterable<LlmStreamEvent>) {
  const all: LlmStreamEvent[] = [];
  for await (const e of events) all.push(e);
  return all;
}

describe('Anthropic tools', () => {
  it('reports tool calls and replays the turn with its thinking block unchanged', async () => {
    const fake = fakeFetch([anthropicToolUse(), anthropicToolUse()]);
    const p = new AnthropicProvider({ apiKey: 'k', maxRetries: 0, fetch: fake.fetch });
    const first = await p.complete({
      model: 'claude-sonnet-5',
      messages: [{ role: 'user', content: 'Was heißt كتاب?' }],
      maxTokens: 500,
      tools: [LOOKUP],
    });
    expect(first.stopReason).toBe('tool_use');
    expect(first.toolCalls).toEqual([
      { id: 'toolu_1', name: 'lookup_vocab', input: { query: 'كتاب' } },
    ]);
    expect(fake.requests[0]!.body.tools).toEqual([
      {
        name: 'lookup_vocab',
        description: 'Find words of the course.',
        input_schema: LOOKUP.inputSchema,
      },
    ]);
    await p.complete({
      model: 'claude-sonnet-5',
      messages: history({
        role: 'assistant',
        content: first.text,
        toolCalls: first.toolCalls,
        replay: first.replay,
      }),
      maxTokens: 500,
      tools: [LOOKUP],
    });
    expect(fake.requests[1]!.body.messages).toEqual([
      { role: 'user', content: 'Was heißt كتاب?' },
      { role: 'assistant', content: anthropicContent },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_1', content: '{"de":"Buch"}' },
        ],
      },
    ]);
  });

  it('never reports tool calls of a turn cut off by max_tokens', async () => {
    const fake = fakeFetch([anthropicToolUse('max_tokens')]);
    const p = new AnthropicProvider({ apiKey: 'k', maxRetries: 0, fetch: fake.fetch });
    const result = await p.complete({
      model: 'claude-sonnet-5',
      messages: [{ role: 'user', content: 'x' }],
      maxTokens: 5,
      tools: [LOOKUP],
    });
    expect(result).toMatchObject({ stopReason: 'max_tokens', toolCalls: [] });
  });

  it('builds tool_use blocks for a turn from another provider and marks failed results', async () => {
    const fake = fakeFetch([anthropicToolUse('end_turn')]);
    const p = new AnthropicProvider({ apiKey: 'k', maxRetries: 0, fetch: fake.fetch });
    await p.complete({
      model: 'claude-sonnet-5',
      messages: [
        { role: 'user', content: 'q' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'c1', name: 'lookup_vocab', input: null }],
          replay: { provider: 'openrouter', content: {} },
        },
        {
          role: 'tool',
          results: [{ callId: 'c1', content: 'bad input', isError: true }],
        },
        { role: 'assistant', content: 'Fertig.' },
      ],
      maxTokens: 50,
    });
    const messages = fake.requests[0]!.body.messages as unknown[];
    expect(messages[1]).toEqual({
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'c1', name: 'lookup_vocab', input: {} }],
    });
    expect(messages[2]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'c1', content: 'bad input', is_error: true },
      ],
    });
    expect(messages[3]).toEqual({ role: 'assistant', content: 'Fertig.' });
  });

  it('streams with eager tool input and reports the calls at the end', async () => {
    const fake = fakeFetch([
      sse([
        {
          event: 'message_start',
          data: {
            type: 'message_start',
            message: {
              id: 'msg_1',
              type: 'message',
              role: 'assistant',
              model: 'claude-sonnet-5',
              content: [],
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 10, output_tokens: 1 },
            },
          },
        },
        {
          event: 'content_block_start',
          data: {
            type: 'content_block_start',
            index: 0,
            content_block: {
              type: 'tool_use',
              id: 'toolu_9',
              name: 'lookup_vocab',
              input: {},
            },
          },
        },
        {
          event: 'content_block_delta',
          data: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'input_json_delta', partial_json: '{"query": "بيت"}' },
          },
        },
        { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
        {
          event: 'message_delta',
          data: {
            type: 'message_delta',
            delta: { stop_reason: 'tool_use', stop_sequence: null },
            usage: { output_tokens: 12 },
          },
        },
        { event: 'message_stop', data: { type: 'message_stop' } },
      ]),
    ]);
    const p = new AnthropicProvider({ apiKey: 'k', maxRetries: 0, fetch: fake.fetch });
    const events = await collect(
      p.stream({
        model: 'claude-sonnet-5',
        messages: [{ role: 'user', content: 'Haus?' }],
        maxTokens: 100,
        tools: [LOOKUP],
      })
    );
    expect(
      (fake.requests[0]!.body.tools as { eager_input_streaming?: boolean }[])[0]!
    ).toMatchObject({ eager_input_streaming: true });
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      result: {
        stopReason: 'tool_use',
        toolCalls: [{ id: 'toolu_9', name: 'lookup_vocab', input: { query: 'بيت' } }],
      },
    });
  });
});

describe('OpenAI-compatible tools', () => {
  const toolCompletion = (args: string) =>
    json({
      model: 'm',
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: 'call_a',
                type: 'function',
                function: { name: 'lookup_vocab', arguments: args },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });

  it('reports tool calls, tolerating arguments that are not JSON', async () => {
    const fake = fakeFetch([toolCompletion('{"query":"كتاب"}'), toolCompletion('{oops')]);
    const p = openRouterProvider({ apiKey: 'k', fetch: fake.fetch });
    const req = {
      model: 'm',
      messages: [{ role: 'user' as const, content: 'q' }],
      maxTokens: 50,
      tools: [LOOKUP],
    };
    expect((await p.complete(req)).toolCalls).toEqual([
      { id: 'call_a', name: 'lookup_vocab', input: { query: 'كتاب' } },
    ]);
    expect((await p.complete(req)).toolCalls[0]!.input).toBeNull();
    expect(fake.requests[0]!.body.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'lookup_vocab',
          description: 'Find words of the course.',
          parameters: LOOKUP.inputSchema,
        },
      },
    ]);
  });

  it('sends assistant tool calls and tool results in chat-completions form', async () => {
    const fake = fakeFetch([
      json({
        model: 'm',
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      }),
    ]);
    const p = huggingFaceProvider({ apiKey: 'k', fetch: fake.fetch });
    await p.complete({
      model: 'm',
      messages: [
        ...history({
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'toolu_1', name: 'lookup_vocab', input: { query: 'كتاب' } }],
          // An Anthropic replay means nothing to this provider.
          replay: { provider: 'anthropic', content: anthropicContent },
        }),
        { role: 'assistant', content: 'Buch.' },
      ],
      maxTokens: 50,
    });
    expect(fake.requests[0]!.body.messages).toEqual([
      { role: 'user', content: 'Was heißt كتاب?' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'toolu_1',
            type: 'function',
            function: { name: 'lookup_vocab', arguments: '{"query":"كتاب"}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'toolu_1', content: '{"de":"Buch"}' },
      { role: 'assistant', content: 'Buch.' },
    ]);
  });

  it('assembles streamed tool calls from pieces', async () => {
    const fake = fakeFetch([
      sse([
        {
          data: {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_x',
                      function: { name: 'lookup_', arguments: '{"que' },
                    },
                  ],
                },
              },
            ],
          },
        },
        {
          data: {
            choices: [
              {
                delta: {
                  tool_calls: [
                    { index: 0, function: { name: 'vocab', arguments: 'ry":"قلم"}' } },
                    { index: 1, function: { name: 'get_learner_state' } },
                  ],
                },
              },
            ],
          },
        },
        { data: { choices: [{ delta: {}, finish_reason: 'tool_calls' }] } },
        { data: '[DONE]' },
      ]),
    ]);
    const p = openRouterProvider({ apiKey: 'k', fetch: fake.fetch });
    const events = await collect(
      p.stream({ model: 'm', messages: [{ role: 'user', content: 'q' }], maxTokens: 50 })
    );
    expect(events.at(-1)).toMatchObject({
      result: {
        stopReason: 'tool_use',
        toolCalls: [
          { id: 'call_x', name: 'lookup_vocab', input: { query: 'قلم' } },
          { id: 'call_1', name: 'get_learner_state', input: {} },
        ],
      },
    });
  });
});
