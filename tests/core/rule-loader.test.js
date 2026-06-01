import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseRuleLine, parseRuleFile, loadConfig } from '../../src/core/rule-loader.js';

describe('parseRuleLine', () => {
  it('parses a static rule with ID', () => {
    const result = parseRuleLine('# [static:no-console-log] Never use console.log');
    assert.deepEqual(result, {
      type: 'static',
      id: 'no-console-log',
      text: 'Never use console.log',
    });
  });

  it('parses an LLM rule', () => {
    const result = parseRuleLine('# [llm] Never concatenate SQL strings.');
    assert.deepEqual(result, {
      type: 'llm',
      id: '',
      text: 'Never concatenate SQL strings.',
    });
  });

  it('rejects [static] with no ID', () => {
    assert.throws(() => parseRuleLine('# [static] Some rule'), /must include a rule ID/);
  });

  it('parses [ast:rule-id] as reserved (skipped with warning)', () => {
    const result = parseRuleLine('# [ast:func-length] Max 50 lines');
    assert.deepEqual(result, {
      type: 'ast',
      id: 'func-length',
      text: 'Max 50 lines',
    });
  });

  it('returns null for non-rule lines', () => {
    assert.equal(parseRuleLine('## Some heading'), null);
    assert.equal(parseRuleLine(''), null);
    assert.equal(parseRuleLine('Just a comment'), null);
  });
});

describe('parseRuleFile', () => {
  it('extracts all rules from a rule file string', () => {
    const content = [
      '# .guardrails.md',
      '',
      '## Static Rules',
      '# [static:no-todo-comments] No TODO or FIXME comments.',
      '# [static:no-console-log] No console.log.',
      '',
      '## LLM Rules',
      '# [llm] Never concatenate SQL strings.',
      '# [llm] Never hardcode secrets.',
    ].join('\n');

    const { rules } = parseRuleFile(content);
    assert.equal(rules.length, 4);
    assert.equal(rules.filter(r => r.type === 'static').length, 2);
    assert.equal(rules.filter(r => r.type === 'llm').length, 2);
  });

  it('handles multi-line LLM rules (continuation lines starting with #)', () => {
    const content = [
      '# [llm] Never construct SQL queries by concatenating variables.',
      '#        Use parameterized queries or a query builder.',
    ].join('\n');

    const { rules } = parseRuleFile(content);
    assert.equal(rules.length, 1);
    assert.ok(rules[0].text.includes('parameterized queries'));
  });
});

describe('loadConfig', () => {
  it('extracts config keys from rule file', () => {
    const content = [
      'model: qwen2.5-coder:1.5b',
      'dashboard_url: https://example.com',
      'privacy_mode: strict',
      'banned_imports: lodash, moment',
      'ollama_timeout: 30',
      'bypass_lookback: 15',
      '',
      '# [static:no-console-log] No console.log.',
    ].join('\n');

    const config = loadConfig(content);
    assert.equal(config.model, 'qwen2.5-coder:1.5b');
    assert.equal(config.dashboard_url, 'https://example.com');
    assert.equal(config.privacy_mode, 'strict');
    assert.equal(config.ollama_timeout, 30);
    assert.equal(config.bypass_lookback, 15);
    assert.deepEqual(config.banned_imports, ['lodash', 'moment']);
  });

  it('returns defaults for missing keys', () => {
    const config = loadConfig('');
    assert.equal(config.model, 'qwen2.5-coder:1.5b');
    assert.equal(config.ollama_timeout, 20);
    assert.equal(config.bypass_lookback, 10);
    assert.equal(config.privacy_mode, undefined);
  });
});
