import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPRComment } from '../../src/core/ci-reporter.js';

test('formatPRComment returns empty string when no violations', () => {
  const result = formatPRComment([]);
  assert.strictEqual(result, '');
});

test('formatPRComment returns markdown with violation count in header', () => {
  const violations = [
    { file: 'src/db.js', rule: 'no-console-log', type: 'static', reason: null },
    { file: 'src/auth.js', rule: 'Never hardcode secrets', type: 'llm',
      reason: 'API key on line 12' },
  ];
  const result = formatPRComment(violations);
  assert.ok(result.includes('2 violation'));
  assert.ok(result.includes('Guardrails Review'));
});

test('formatPRComment includes file names in table', () => {
  const violations = [
    { file: 'src/index.js', rule: 'no-debug-flag', type: 'static', reason: null },
  ];
  const result = formatPRComment(violations);
  assert.ok(result.includes('src/index.js'));
  assert.ok(result.includes('no-debug-flag'));
});

test('formatPRComment includes reason when present', () => {
  const violations = [
    { file: 'src/q.js', rule: 'No raw SQL', type: 'llm', reason: 'String concat on line 5' },
  ];
  const result = formatPRComment(violations);
  assert.ok(result.includes('String concat on line 5'));
});

test('formatPRComment handles missing file gracefully', () => {
  const violations = [
    { file: null, rule: 'no-console-log', type: 'static', reason: null },
  ];
  const result = formatPRComment(violations);
  assert.ok(result.includes('unknown'));
});
