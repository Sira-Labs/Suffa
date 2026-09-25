/**
 * Adapter for OpenAI-compatible chat-completion APIs, used for non-Claude models: OpenRouter
 * and Hugging Face (Inference Providers router or a dedicated Inference Endpoint).
 */
import { LlmError, kindForStatus } from './errors.js';
import { readSse } from './sse.js';
import type {
  LlmProvider,
  LlmRequest,
  LlmResult,
  LlmStopReason,
  LlmStreamEvent,
  LlmUsage,
  ProviderId,
} from './types.js';

export interface OpenAiCompatibleOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  /** Extra headers (e.g. OpenRouter's app attribution). */
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number } | null;
}

interface ChatChoice {
  message?: { content?: string | null };
  delta?: { content?: string | null };
  finish_reason?: string | null;
}

interface ChatChunk {
  model?: string;
  choices?: ChatChoice[];
  usage?: ChatUsage | null;
}

const STOP: Record<string, LlmStopReason> = {
  stop: 'end',
  length: 'max_tokens',
  content_filter: 'refusal',
  tool_calls: 'tool_use',
};

function usageOf(usage: ChatUsage | null | undefined): LlmUsage {
  const prompt = usage?.prompt_tokens ?? 0;
  const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    inputTokens: Math.max(0, prompt - cached),
    outputTokens: usage?.completion_tokens ?? 0,
    cacheReadTokens: cached,
    cacheWriteTokens: 0,
  };
}

export class OpenAiCompatibleProvider implements LlmProvider {
  private readonly fetchImpl: typeof fetch;

  constructor(
    readonly id: ProviderId,
    private readonly options: OpenAiCompatibleOptions
  ) {
    this.fetchImpl = options.fetch ?? fetch;
  }

  async complete(request: LlmRequest): Promise<LlmResult> {
    const response = await this.post(request, false);
    const body = (await response.json()) as ChatChunk;
    const choice = body.choices?.[0];
    return {
      provider: this.id,
      model: body.model ?? request.model,
      text: choice?.message?.content ?? '',
      stopReason: STOP[choice?.finish_reason ?? ''] ?? 'other',
      usage: usageOf(body.usage),
    };
  }

  async *stream(request: LlmRequest): AsyncIterable<LlmStreamEvent> {
    const response = await this.post(request, true);
    let text = '';
    let model = request.model;
    let finish = '';
    let usage: ChatUsage | null | undefined;
    try {
      for await (const data of readSse(response.body!)) {
        if (data === '[DONE]') break;
        const chunk = JSON.parse(data) as ChatChunk;
        model = chunk.model ?? model;
        usage = chunk.usage ?? usage;
        const choice = chunk.choices?.[0];
        finish = choice?.finish_reason ?? finish;
        const delta = choice?.delta?.content;
        if (delta) {
          text += delta;
          yield { type: 'text', text: delta };
        }
      }
    } catch (error) {
      throw this.transportError(error, request.signal);
    }
    yield {
      type: 'done',
      result: {
        provider: this.id,
        model,
        text,
        stopReason: STOP[finish] ?? 'other',
        usage: usageOf(usage),
      },
    };
  }

  private async post(request: LlmRequest, stream: boolean): Promise<Response> {
    const system = (request.system ?? []).map((p) => p.text).join('\n\n');
    const body = {
      model: request.model,
      max_tokens: request.maxTokens,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...request.messages,
      ],
      ...(request.jsonSchema
        ? {
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'output', strict: true, schema: request.jsonSchema },
            },
          }
        : {}),
      ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
    };
    const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 120_000);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await this.fetchImpl(
        `${this.options.baseUrl.replace(/\/$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.options.apiKey}`,
            'content-type': 'application/json',
            ...this.options.headers,
          },
          body: JSON.stringify(body),
          signal,
        }
      );
    } catch (error) {
      throw this.transportError(error, request.signal);
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      throw new LlmError(
        kindForStatus(response.status),
        this.id,
        `${this.id} answered ${response.status}${detail ? `: ${detail}` : ''}`,
        response.status
      );
    }
    return response;
  }

  private transportError(error: unknown, signal: AbortSignal | undefined): unknown {
    if (error instanceof LlmError || error instanceof SyntaxError) return error;
    if (signal?.aborted) {
      return new LlmError('aborted', this.id, 'request aborted', undefined, {
        cause: error,
      });
    }
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return new LlmError('timeout', this.id, 'request timed out', undefined, {
        cause: error,
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    return new LlmError('network', this.id, message, undefined, { cause: error });
  }
}

/** OpenRouter: open-weight models behind one OpenAI-compatible API. */
export function openRouterProvider(options: {
  apiKey: string;
  appUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): OpenAiCompatibleProvider {
  return new OpenAiCompatibleProvider('openrouter', {
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: options.apiKey,
    headers: {
      'X-Title': 'Suffa',
      ...(options.appUrl ? { 'HTTP-Referer': options.appUrl } : {}),
    },
    fetch: options.fetch,
    timeoutMs: options.timeoutMs,
  });
}

/**
 * Hugging Face: the Inference Providers router by default, or a dedicated Inference Endpoint
 * (`endpointUrl`, which serves the same API under `/v1`).
 */
export function huggingFaceProvider(options: {
  apiKey: string;
  endpointUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): OpenAiCompatibleProvider {
  return new OpenAiCompatibleProvider('huggingface', {
    baseUrl: options.endpointUrl
      ? `${options.endpointUrl.replace(/\/$/, '')}/v1`
      : 'https://router.huggingface.co/v1',
    apiKey: options.apiKey,
    fetch: options.fetch,
    timeoutMs: options.timeoutMs,
  });
}
