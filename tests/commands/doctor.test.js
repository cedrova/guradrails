import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatCheckResult } from '../../src/commands/doctor.js';

describe('formatCheckResult', () => {
  it('formats OK result', () => {
    const line = formatCheckResult({ ok: true, label: 'Ollama installed', detail: 'v0.3.6' });
    assert.ok(line.includes('[OK]'));
    assert.ok(line.includes('Ollama installed'));
    assert.ok(line.includes('v0.3.6'));
  });

  it('formats FAIL result with fix', () => {
    const line = formatCheckResult({
      ok: false,
      label: 'Model not found',
      detail: 'qwen2.5-coder:1.5b',
      fix: 'ollama pull qwen2.5-coder:1.5b',
    });
    assert.ok(line.includes('[FAIL]'));
    assert.ok(line.includes('Fix:'));
  });
});
