import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLLMClient } from '../../src/core/llm-client.js';

test('createLLMClient returns OllamaProvider when llm_provider is ollama', () => {
  const client = createLLMClient({ llm_provider: 'ollama', model: 'qwen2.5-coder:1.5b' });
  assert.strictEqual(typeof client.generate, 'function');
  assert.strictEqual(typeof client.isAvailable, 'function');
});

test('createLLMClient returns OllamaProvider as default when llm_provider unset', () => {
  const client = createLLMClient({ model: 'qwen2.5-coder:1.5b' });
  assert.strictEqual(typeof client.generate, 'function');
});

test('createLLMClient returns OpenAIProvider when llm_provider is openai', () => {
  const client = createLLMClient({ llm_provider: 'openai', model: 'gpt-4o-mini' });
  assert.strictEqual(typeof client.generate, 'function');
  assert.strictEqual(typeof client.isAvailable, 'function');
});

test('createLLMClient returns AnthropicProvider when llm_provider is anthropic', () => {
  const client = createLLMClient({ llm_provider: 'anthropic', model: 'claude-haiku-4-5' });
  assert.strictEqual(typeof client.generate, 'function');
  assert.strictEqual(typeof client.isAvailable, 'function');
});
