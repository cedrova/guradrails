import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runStaticChecks } from '../../src/core/static-runner.js';

describe('runStaticChecks', () => {
  it('detects console.log', () => {
    const rules = [{ type: 'static', id: 'no-console-log', text: '' }];
    const violations = runStaticChecks('+  console.log("hello");', rules);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].rule, 'no-console-log');
  });

  it('detects TODO comments', () => {
    const rules = [{ type: 'static', id: 'no-todo-comments', text: '' }];
    const violations = runStaticChecks('+  // TODO: fix this', rules);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].rule, 'no-todo-comments');
  });

  it('detects FIXME comments', () => {
    const rules = [{ type: 'static', id: 'no-todo-comments', text: '' }];
    const violations = runStaticChecks('+  // FIXME: broken', rules);
    assert.equal(violations.length, 1);
  });

  it('detects debug: true', () => {
    const rules = [{ type: 'static', id: 'no-debug-flag', text: '' }];
    const violations = runStaticChecks('+  debug: true', rules);
    assert.equal(violations.length, 1);
  });

  it('detects http:// URLs but not localhost', () => {
    const rules = [{ type: 'static', id: 'no-http-urls', text: '' }];
    assert.equal(runStaticChecks('+  const url = "http://example.com"', rules).length, 1);
    assert.equal(runStaticChecks('+  const url = "http://localhost:3000"', rules).length, 0);
  });

  it('detects banned imports', () => {
    const rules = [{ type: 'static', id: 'no-banned-import', text: '' }];
    const config = { banned_imports: ['lodash'] };
    const diff = "+import _ from 'lodash';";
    const violations = runStaticChecks(diff, rules, config);
    assert.equal(violations.length, 1);
  });

  it('skips banned import check when no banned_imports config', () => {
    const rules = [{ type: 'static', id: 'no-banned-import', text: '' }];
    const violations = runStaticChecks("+import _ from 'lodash';", rules, {});
    assert.equal(violations.length, 0);
  });

  it('skips LLM rules entirely', () => {
    const rules = [{ type: 'llm', id: '', text: 'Never do bad stuff' }];
    const violations = runStaticChecks('+  console.log("hello");', rules);
    assert.equal(violations.length, 0);
  });

  it('warns and skips unknown static IDs', () => {
    const rules = [{ type: 'static', id: 'no-consol-log', text: '' }];
    const violations = runStaticChecks('+  console.log("hello");', rules);
    assert.equal(violations.length, 0);
  });

  it('returns no violations for clean code', () => {
    const rules = [
      { type: 'static', id: 'no-console-log', text: '' },
      { type: 'static', id: 'no-todo-comments', text: '' },
    ];
    const violations = runStaticChecks('+  logger.info("hello");', rules);
    assert.equal(violations.length, 0);
  });
});
