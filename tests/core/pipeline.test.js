import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatViolations } from '../../src/core/pipeline.js';

describe('formatViolations', () => {
  it('returns empty string for empty violations list', () => {
    assert.equal(formatViolations([]), '');
  });

  it('formats static violations correctly', () => {
    const violations = [
      { type: 'static', rule: 'no-console-log' },
    ];
    const output = formatViolations(violations);
    assert.ok(output.includes('🚫 Guardrails: commit blocked'));
    assert.ok(output.includes('[static] no-console-log'));
    assert.ok(output.includes('1 violation(s) found.'));
  });

  it('formats LLM violations with reason correctly', () => {
    const violations = [
      { type: 'llm', rule: 'Never hardcode secrets', reason: 'Found API key at line 4' },
    ];
    const output = formatViolations(violations);
    assert.ok(output.includes('🚫 Guardrails: commit blocked'));
    assert.ok(output.includes('[llm] Never hardcode secrets'));
    assert.ok(output.includes('Found API key at line 4'));
    assert.ok(output.includes('1 violation(s) found.'));
  });
});
