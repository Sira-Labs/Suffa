/**
 * Anthropic adapter on the official SDK. The stable system prefix gets a cache breakpoint so
 * repeated calls read it from the prompt cache; effort steers adaptive thinking (models that
 * think by default); structured output uses `output_config.format`. SDK errors map to
 * `LlmError` kinds via the SDK's typed classes.
 */
import Anthropic from '@anthropic-ai/sdk';
import { LlmError, kindForStatus } from './errors.js';
import type {
  LlmProvider,
  LlmRequest,
  LlmResult,
  LlmStopReason,
  LlmStreamEvent,
} from './types.js';

export interface AnthropicOptions {
  apiKey: string;
  /** SDK retries per call; the router's fallbacks cover the rest. */
  maxRetries?: number;
  timeoutMs?: number;
  /** Injected in tests (recorded fixtures). */
  fetch?: typeof fetch;
}

/** Haiku 4.5 rejects `effort`; the current Sonnet/Opus models accept it. */
export function supportsEffort(model: string): boolean {
  return !model.startsWith('claude-haiku');
}

const STOP: Record<string, LlmStopReason> = {
  end_turn: 'end',
  stop_sequence: 'end',
  max_tokens: 'max_tokens',
  model_context_window_exceeded: 'max_tokens',
  refusal: 'refusal',
  tool_use: 'tool_use',
};

export class AnthropicProvider implements LlmProvider {
  readonly id = 'anthropic' as const;
  private readonly client: Anthropic;

  constructor(options: AnthropicOptions) {
    this.client = new Anthropic({
      apiKey: options.apiKey,
      maxRetries: options.maxRetries ?? 1,
      timeout: options.timeoutMs ?? 120_000,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }

  async complete(request: LlmRequest): Promise<LlmResult> {
    try {
      const message = await this.client.messages.create(this.params(request), {
        signal: request.signal,
      });
      return this.result(message);
    } catch (error) {
      throw toLlmError(error);
    }
  }

  async *stream(request: LlmRequest): AsyncIterable<LlmStreamEvent> {
    try {
      const stream = this.client.messages.stream(this.params(request), {
        signal: request.signal,
      });
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text };
        }
      }
      yield { type: 'done', result: this.result(await stream.finalMessage()) };
    } catch (error) {
      throw toLlmError(error);
    }
  }

  private params(request: LlmRequest): Anthropic.MessageCreateParamsNonStreaming {
    const system = request.system ?? [];
    const lastCached = system.map((p) => Boolean(p.cache)).lastIndexOf(true);
    const outputConfig: Anthropic.OutputConfig = {};
    if (request.effort && supportsEffort(request.model))
      outputConfig.effort = request.effort;
    if (request.jsonSchema) {
      outputConfig.format = { type: 'json_schema', schema: request.jsonSchema };
    }
    return {
      model: request.model,
      max_tokens: request.maxTokens,
      ...(system.length > 0
        ? {
            system: system.map(
              (part, i): Anthropic.TextBlockParam => ({
                type: 'text',
                text: part.text,
                ...(i === lastCached ? { cache_control: { type: 'ephemeral' } } : {}),
              })
            ),
          }
        : {}),
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      ...(Object.keys(outputConfig).length > 0 ? { output_config: outputConfig } : {}),
    };
  }

  private result(message: Anthropic.Message): LlmResult {
    const text = message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');
    return {
      provider: this.id,
      model: message.model,
      text,
      stopReason: (message.stop_reason && STOP[message.stop_reason]) || 'other',
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
      },
    };
  }
}

/** Most specific SDK class first: timeouts and aborts are subclasses of the generic errors. */
export function toLlmError(error: unknown): unknown {
  if (error instanceof LlmError) return error;
  if (error instanceof Anthropic.APIUserAbortError) {
    return new LlmError('aborted', 'anthropic', 'request aborted', undefined, {
      cause: error,
    });
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new LlmError('timeout', 'anthropic', 'request timed out', undefined, {
      cause: error,
    });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new LlmError('network', 'anthropic', error.message, undefined, {
      cause: error,
    });
  }
  if (error instanceof Anthropic.APIError && error.status !== undefined) {
    return new LlmError(
      kindForStatus(error.status),
      'anthropic',
      error.message,
      error.status,
      {
        cause: error,
      }
    );
  }
  return error;
}
