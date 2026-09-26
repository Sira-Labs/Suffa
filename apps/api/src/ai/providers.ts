/** Builds the configured LLM providers; a provider without a key is not routed to. */
import {
  AnthropicProvider,
  huggingFaceProvider,
  mistralProvider,
  openRouterProvider,
  type LlmProvider,
  type ProviderId,
} from '@suffa/llm';
import type { Config } from '../config.js';

export function buildProviders(
  config: Pick<Config, 'ai' | 'publicUrl'>
): Partial<Record<ProviderId, LlmProvider>> {
  const providers: Partial<Record<ProviderId, LlmProvider>> = {};
  if (config.ai.anthropicKey) {
    providers.anthropic = new AnthropicProvider({ apiKey: config.ai.anthropicKey });
  }
  if (config.ai.openRouterKey) {
    providers.openrouter = openRouterProvider({
      apiKey: config.ai.openRouterKey,
      appUrl: config.publicUrl,
    });
  }
  if (config.ai.huggingFaceKey) {
    providers.huggingface = huggingFaceProvider({
      apiKey: config.ai.huggingFaceKey,
      endpointUrl: config.ai.huggingFaceEndpoint,
    });
  }
  if (config.ai.mistralKey) {
    providers.mistral = mistralProvider({ apiKey: config.ai.mistralKey });
  }
  return providers;
}
