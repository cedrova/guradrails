import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../../src/core/prompt-builder.js';

describe('buildPrompt', () => {
  const rules = [
    { type: 'llm', id: '', text: 'Never concatenate SQL strings.' },
    { type: 'llm', id: '', text: 'Never hardcode secrets.' },
  ];
  const diff = '+  const q = "SELECT * FROM users WHERE id=" + userId;';

  it('includes system instruction', () => {
    const prompt = buildPrompt(rules, diff);
    assert.ok(prompt.includes('You are a code reviewer'));
  });

  it('includes all LLM rules numbered', () => {
    const prompt = buildPrompt(rules, diff);
    assert.ok(prompt.includes('1. Never concatenate SQL strings.'));
    assert.ok(prompt.includes('2. Never hardcode secrets.'));
  });

  it('includes the diff', () => {
    const prompt = buildPrompt(rules, diff);
    assert.ok(prompt.includes(diff));
  });

  it('includes JSON schema instruction', () => {
    const prompt = buildPrompt(rules, diff);
    assert.ok(prompt.includes('"status": "pass" | "fail"'));
    assert.ok(prompt.includes('Return ONLY a JSON object'));
  });

  it('filters out non-LLM rules', () => {
    const mixed = [
      { type: 'static', id: 'no-console-log', text: 'No console.log' },
      { type: 'llm', id: '', text: 'Never hardcode secrets.' },
    ];
    const prompt = buildPrompt(mixed, diff);
    assert.ok(!prompt.includes('No console.log'));
    assert.ok(prompt.includes('Never hardcode secrets.'));
  });
});
