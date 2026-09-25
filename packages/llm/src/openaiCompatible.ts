/**
 * Adapter for OpenAI-compatible chat-completion APIs, used for non-Claude models: OpenRouter
 * and Hugging Face (Inference Providers router or a dedicated Inference Endpoint).
 */
import { LlmError, kindForStatus } from './errors.js';
import { readSse } from './sse.js';
import type {
  LlmMessage,
  LlmProvider,
  LlmRequest,
  LlmResult,
  LlmStopReason,
  LlmStreamEvent,
  LlmUsage,
  ProviderId,
  ToolCall,
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

interface WireToolCall {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface ChatChoice {
  message?: { content?: string | null; tool_calls?: WireToolCall[] | null };
  delta?: { content?: string | null; tool_calls?: WireToolCall[] | null };
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

function parseArguments(raw: string | undefined): unknown {
  try {
    return JSON.parse(raw || '{}');
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function toolCallsOf(wire: WireToolCall[] | null | undefined): ToolCall[] {
  return (wire ?? []).map((c, i) => ({
    id: c.id ?? `call_${i}`,
    name: c.function?.name ?? '',
    input: parseArguments(c.function?.arguments),
  }));
}

/** Neutral messages in chat-completions form (tool results become `tool` messages). */
function wireMessages(messages: LlmMessage[]): unknown[] {
  return messages.flatMap((m): unknown[] => {
    if (m.role === 'user') return [{ role: 'user', content: m.content }];
    if (m.role === 'tool') {
      return m.results.map((r) => ({
        role: 'tool',
        tool_call_id: r.callId,
        content: r.content,
      }));
    }
    if (!m.toolCalls?.length) return [{ role: 'assistant', content: m.content }];
    return [
      {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) },
        })),
      },
    ];
  });
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
    const stopReason = STOP[choice?.finish_reason ?? ''] ?? 'other';
    return {
      provider: this.id,
      model: body.model ?? request.model,
      text: choice?.message?.content ?? '',
      stopReason,
      usage: usageOf(body.usage),
      toolCalls:
        stopReason === 'tool_use' ? toolCallsOf(choice?.message?.tool_calls) : [],
    };
  }

  async *stream(request: LlmRequest): AsyncIterable<LlmStreamEvent> {
    const response = await this.post(request, true);
    let text = '';
    let model = request.model;
    let finish = '';
    let usage: ChatUsage | null | undefined;
    // Tool calls arrive in pieces keyed by index: id and name first, arguments in fragments.
    const calls = new Map<
      number,
      Required<Pick<WireToolCall, 'id'>> & { name: string; args: string }
    >();
    try {
      for await (const data of readSse(response.body!)) {
        if (data === '[DONE]') break;
        const chunk = JSON.parse(data) as ChatChunk;
        model = chunk.model ?? model;
        usage = chunk.usage ?? usage;
        const choice = chunk.choices?.[0];
        finish = choice?.finish_reason ?? finish;
        for (const piece of choice?.delta?.tool_calls ?? []) {
          const index = piece.index ?? 0;
          const call = calls.get(index) ?? { id: `call_${index}`, name: '', args: '' };
          if (piece.id) call.id = piece.id;
          call.name += piece.function?.name ?? '';
          call.args += piece.function?.arguments ?? '';
          calls.set(index, call);
        }
        const delta = choice?.delta?.content;
        if (delta) {
          text += delta;
          yield { type: 'text', text: delta };
        }
      }
    } catch (error) {
      throw this.transportError(error, request.signal);
    }
    const stopReason = STOP[finish] ?? 'other';
    yield {
      type: 'done',
      result: {
        provider: this.id,
        model,
        text,
        stopReason,
        usage: usageOf(usage),
        toolCalls:
          stopReason === 'tool_use'
            ? [...calls.entries()]
                .sort(([a], [b]) => a - b)
                .map(([, c]) => ({
                  id: c.id,
                  name: c.name,
                  input: parseArguments(c.args),
                }))
            : [],
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
        ...wireMessages(request.messages),
      ],
      ...(request.tools?.length
        ? {
            tools: request.tools.map((t) => ({
              type: 'function',
              function: {
                name: t.name,
                description: t.description,
                parameters: t.inputSchema,
              },
            })),
          }
        : {}),
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
