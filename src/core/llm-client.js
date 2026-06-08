import { OllamaProvider }    from './ollama-client.js';
import { OpenAIProvider }    from './openai-client.js';
import { AnthropicProvider } from './anthropic-client.js';

/**
 * Factory — returns the correct LLM provider based on config.
 * All providers expose the same interface:
 *   generate(prompt, options) → Promise<string>
 *   isAvailable()            → Promise<{ ok: boolean, error: string | null }>
 */
export function createLLMClient(config) {
  switch (config.llm_provider) {
    case 'openai':    return new OpenAIProvider(config);
    case 'anthropic': return new AnthropicProvider(config);
    default:          return new OllamaProvider(config);
  }
}
