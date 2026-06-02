import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseResponse } from '../../src/core/response-parser.js';

describe('parseResponse', () => {
  it('parses a valid pass response', () => {
    const raw = '{"status":"pass","violations":[]}';
    const result = parseResponse(raw);
    assert.equal(result.status, 'pass');
    assert.deepEqual(result.violations, []);
  });

  it('parses a valid fail response', () => {
    const raw = JSON.stringify({
      status: 'fail',
      violations: [{ rule: 'no SQL concat', reason: 'string concatenation found' }],
    });
    const result = parseResponse(raw);
    assert.equal(result.status, 'fail');
    assert.equal(result.violations.length, 1);
  });

  it('returns infrastructure_error for invalid JSON', () => {
    const result = parseResponse('This is not JSON at all');
    assert.equal(result.status, 'infrastructure_error');
    assert.deepEqual(result.violations, []);
  });

  it('returns infrastructure_error for invalid status', () => {
    const raw = '{"status":"maybe","violations":[]}';
    const result = parseResponse(raw);
    assert.equal(result.status, 'infrastructure_error');
  });

  it('returns infrastructure_error when violations is not an array', () => {
    const raw = '{"status":"pass","violations":"none"}';
    const result = parseResponse(raw);
    assert.equal(result.status, 'infrastructure_error');
  });

  it('handles leading/trailing whitespace in raw response', () => {
    const raw = '  \n {"status":"pass","violations":[]}  \n ';
    const result = parseResponse(raw);
    assert.equal(result.status, 'pass');
  });

  it('strips markdown fences if model wraps JSON in them', () => {
    const raw = '```json\n{"status":"pass","violations":[]}\n```';
    const result = parseResponse(raw);
    assert.equal(result.status, 'pass');
  });
});
