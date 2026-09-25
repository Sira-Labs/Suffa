/**
 * The provider-neutral contract of the LLM gateway (ADR-0010). Callers name a task, the router
 * picks provider + model; adapters translate this shape to each provider's wire format.
 */

export type ProviderId = 'anthropic' | 'openrouter' | 'huggingface';

/** What a task may require of a model; the router only picks models that declare it. */
export type Capability = 'tools' | 'structuredOutput' | 'vision' | 'streaming';
export const CAPABILITIES: readonly Capability[] = [
  'tools',
  'structuredOutput',
  'vision',
  'streaming',
];

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * One part of the system prompt. Parts marked `cache` form the stable prefix (persona,
 * curriculum pack) and must stay byte-identical between calls; volatile parts come after.
 */
export interface SystemPart {
  text: string;
  cache?: boolean;
}

export interface LlmRequest {
  model: string;
  system?: SystemPart[];
  messages: LlmMessage[];
  maxTokens: number;
  /** Reasoning effort; ignored by models that do not support it. */
  effort?: Effort;
  /** JSON schema the answer must follow (structured output). */
  jsonSchema?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface LlmUsage {
  /** Uncached input tokens (billed at the full input price). */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export type LlmStopReason = 'end' | 'max_tokens' | 'refusal' | 'tool_use' | 'other';

export interface LlmResult {
  provider: ProviderId;
  model: string;
  text: string;
  stopReason: LlmStopReason;
  usage: LlmUsage;
}

export type LlmStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'done'; result: LlmResult };

// TODO(2026-09-25): tool calls (al-Muʿallim tools, Sprint 10) extend request and result.
export interface LlmProvider {
  readonly id: ProviderId;
  complete(request: LlmRequest): Promise<LlmResult>;
  /** Streams text deltas and ends with exactly one `done` event. */
  stream(request: LlmRequest): AsyncIterable<LlmStreamEvent>;
}

export const EMPTY_USAGE: LlmUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};
