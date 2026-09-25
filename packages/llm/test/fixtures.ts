/**
 * Wire-format fixtures, shaped like recorded provider responses. Each builder turns the same
 * neutral scenario (text pieces + token counts) into one provider's format.
 */
import { json, sse } from './fakeFetch.js';

export interface Scenario {
  model: string;
  pieces: string[];
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  finish: 'end' | 'max_tokens' | 'refusal';
}

export interface WireFixtures {
  complete(s: Scenario): Response;
  stream(s: Scenario): Response;
  error(status: number): Response;
  /** Whether the provider reports cache writes (OpenAI-compatible APIs do not). */
  reportsCacheWrites: boolean;
}

const ANTHROPIC_STOP = { end: 'end_turn', max_tokens: 'max_tokens', refusal: 'refusal' };
const OPENAI_STOP = { end: 'stop', max_tokens: 'length', refusal: 'content_filter' };

export const anthropicWire: WireFixtures = {
  reportsCacheWrites: true,
  complete: (s) =>
    json({
      id: 'msg_01',
      type: 'message',
      role: 'assistant',
      model: s.model,
      content: [{ type: 'text', text: s.pieces.join('') }],
      stop_reason: ANTHROPIC_STOP[s.finish],
      stop_sequence: null,
      usage: {
        input_tokens: s.input,
        output_tokens: s.output,
        cache_read_input_tokens: s.cacheRead,
        cache_creation_input_tokens: s.cacheWrite,
      },
    }),
  stream: (s) =>
    sse([
      {
        event: 'message_start',
        data: {
          type: 'message_start',
          message: {
            id: 'msg_01',
            type: 'message',
            role: 'assistant',
            model: s.model,
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: {
              input_tokens: s.input,
              output_tokens: 1,
              cache_read_input_tokens: s.cacheRead,
              cache_creation_input_tokens: s.cacheWrite,
            },
          },
        },
      },
      {
        event: 'content_block_start',
        data: {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        },
      },
      ...s.pieces.map((text) => ({
        event: 'content_block_delta',
        data: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text },
        },
      })),
      { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
      {
        event: 'message_delta',
        data: {
          type: 'message_delta',
          delta: { stop_reason: ANTHROPIC_STOP[s.finish], stop_sequence: null },
          usage: { output_tokens: s.output },
        },
      },
      { event: 'message_stop', data: { type: 'message_stop' } },
    ]),
  error: (status) =>
    json(
      {
        type: 'error',
        error: {
          type: status === 429 ? 'rate_limit_error' : 'api_error',
          message: 'nope',
        },
      },
      status
    ),
};

export const openAiWire: WireFixtures = {
  reportsCacheWrites: false,
  complete: (s) =>
    json({
      id: 'gen-1',
      object: 'chat.completion',
      model: s.model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: s.pieces.join('') },
          finish_reason: OPENAI_STOP[s.finish],
        },
      ],
      usage: {
        prompt_tokens: s.input + s.cacheRead,
        completion_tokens: s.output,
        prompt_tokens_details: { cached_tokens: s.cacheRead },
      },
    }),
  stream: (s) =>
    sse([
      ...s.pieces.map((content) => ({
        data: {
          id: 'gen-1',
          model: s.model,
          choices: [{ index: 0, delta: { content }, finish_reason: null }],
        },
      })),
      {
        data: {
          id: 'gen-1',
          model: s.model,
          choices: [{ index: 0, delta: {}, finish_reason: OPENAI_STOP[s.finish] }],
        },
      },
      {
        data: {
          id: 'gen-1',
          model: s.model,
          choices: [],
          usage: {
            prompt_tokens: s.input + s.cacheRead,
            completion_tokens: s.output,
            prompt_tokens_details: { cached_tokens: s.cacheRead },
          },
        },
      },
      { data: '[DONE]' },
    ]),
  error: (status) => json({ error: { message: 'nope', code: status } }, status),
};
