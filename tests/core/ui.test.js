import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpinner, formatViolationTable, statusLine } from '../../src/core/ui.js';

test('createSpinner returns object with start, succeed, fail, warn methods', () => {
  const spinner = createSpinner('Testing...');
  assert.strictEqual(typeof spinner.start, 'function');
  assert.strictEqual(typeof spinner.succeed, 'function');
  assert.strictEqual(typeof spinner.fail, 'function');
  assert.strictEqual(typeof spinner.warn, 'function');
});

test('formatViolationTable includes rule text for each violation', () => {
  const violations = [
    { rule: 'no-console-log', type: 'static', reason: null },
    { rule: 'Never hardcode secrets', type: 'llm', reason: 'API key on line 12' },
  ];
  const output = formatViolationTable(violations);
  assert.ok(output.includes('no-console-log'));
  assert.ok(output.includes('Never hardcode secrets'));
  assert.ok(output.includes('API key on line 12'));
  assert.ok(output.includes('2 violation'));
});

test('formatViolationTable handles single violation', () => {
  const violations = [{ rule: 'no-debug-flag', type: 'static', reason: null }];
  const output = formatViolationTable(violations);
  assert.ok(output.includes('1 violation'));
});

test('statusLine ok produces string containing the label', () => {
  const line = statusLine('ok', 'Ollama installed', 'v0.3.6');
  assert.ok(line.includes('Ollama installed'));
  assert.ok(line.includes('v0.3.6'));
});

test('statusLine fail produces string containing the label', () => {
  const line = statusLine('fail', 'Model not found');
  assert.ok(line.includes('Model not found'));
});

test('statusLine warn produces string containing the label', () => {
  const line = statusLine('warn', 'Cloud LLM selected');
  assert.ok(line.includes('Cloud LLM selected'));
});
