import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findBypassed } from '../../src/core/bypass.js';

describe('findBypassed', () => {
  it('identifies commits in git log but not in known hashes', () => {
    const gitCommits = [
      { hash: 'aaa', author: 'dev@test.com', timestamp: '2025-01-01T00:00:00Z' },
      { hash: 'bbb', author: 'dev@test.com', timestamp: '2025-01-01T00:01:00Z' },
      { hash: 'ccc', author: 'dev@test.com', timestamp: '2025-01-01T00:02:00Z' },
    ];
    const knownHashes = ['aaa', 'ccc'];

    const bypassed = findBypassed(gitCommits, knownHashes);
    assert.equal(bypassed.length, 1);
    assert.equal(bypassed[0].hash, 'bbb');
  });

  it('returns empty when all commits are known', () => {
    const gitCommits = [{ hash: 'aaa', author: 'dev@test.com', timestamp: '2025-01-01' }];
    const bypassed = findBypassed(gitCommits, ['aaa']);
    assert.equal(bypassed.length, 0);
  });

  it('returns all as bypassed when nothing is known', () => {
    const gitCommits = [
      { hash: 'aaa', author: 'dev@test.com', timestamp: '2025-01-01' },
      { hash: 'bbb', author: 'dev@test.com', timestamp: '2025-01-01' },
    ];
    const bypassed = findBypassed(gitCommits, []);
    assert.equal(bypassed.length, 2);
  });
});
