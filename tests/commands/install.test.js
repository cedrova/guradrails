import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateHookScript } from '../../src/commands/install.js';

describe('generateHookScript', () => {
  it('produces a bash script that calls guardrails', () => {
    const script = generateHookScript();
    assert.ok(script.startsWith('#!/bin/sh'));
    assert.ok(script.includes('guardrails'));
    assert.ok(script.includes('review'));
  });
});
