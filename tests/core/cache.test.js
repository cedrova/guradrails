import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Cache } from '../../src/core/cache.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Cache', () => {
  let cache;
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'guardrails-cache-test-'));
    cache = new Cache(join(tempDir, 'cache.json'));
  });

  it('returns null for cache miss', () => {
    assert.equal(cache.get('foo.js', 'diffcontent'), null);
  });

  it('returns cached result for cache hit', () => {
    const result = { status: 'pass', violations: [] };
    cache.set('foo.js', 'diffcontent', result);
    const hit = cache.get('foo.js', 'diffcontent');
    assert.deepEqual(hit, result);
  });

  it('misses when diff content changes', () => {
    cache.set('foo.js', 'old-diff', { status: 'pass', violations: [] });
    assert.equal(cache.get('foo.js', 'new-diff'), null);
  });

  it('expires entries older than TTL', () => {
    cache.set('foo.js', 'diffcontent', { status: 'pass', violations: [] });
    // Manually age the entry
    const key = cache._makeKey('foo.js', 'diffcontent');
    cache._store[key].timestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
    assert.equal(cache.get('foo.js', 'diffcontent'), null);
  });

  it('persists to disk and loads on construction', () => {
    const cachePath = join(tempDir, 'persist-test.json');
    const c1 = new Cache(cachePath);
    c1.set('foo.js', 'diff', { status: 'pass', violations: [] });
    c1.save();

    const c2 = new Cache(cachePath);
    assert.deepEqual(c2.get('foo.js', 'diff'), { status: 'pass', violations: [] });
  });
});
