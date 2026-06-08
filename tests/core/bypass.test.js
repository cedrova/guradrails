import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findBypassed, getRecentCommits } from '../../src/core/bypass.js';

// findBypassed is a pure function — fully unit-testable

test('findBypassed returns empty array when all commits have known parent hashes', () => {
  const commits = [
    { hash: 'B', parentHash: 'A', author: 'x@y.com', timestamp: 't1' },
    { hash: 'A', parentHash: null, author: 'x@y.com', timestamp: 't0' },
  ];
  // Session recorded prev_hash = 'A', meaning commit B was reviewed
  const knownParentHashes = ['A'];
  const result = findBypassed(commits, knownParentHashes);
  assert.strictEqual(result.length, 0);
});

test('findBypassed detects a bypassed commit', () => {
  // Timeline: A → X (bypassed, no session) → B (session: prev_hash=X) → Y (session: prev_hash=B)
  const commits = [
    { hash: 'Y', parentHash: 'B', author: 'x@y.com', timestamp: 't3' },
    { hash: 'B', parentHash: 'X', author: 'x@y.com', timestamp: 't2' },
    { hash: 'X', parentHash: 'A', author: 'x@y.com', timestamp: 't1' },
    { hash: 'A', parentHash: null, author: 'x@y.com', timestamp: 't0' },
  ];
  const knownParentHashes = ['X', 'B']; // sessions had prev_hash X and B
  // Y's parent = B, B in set → not bypassed
  // B's parent = X, X in set → not bypassed
  // X's parent = A, A NOT in set → BYPASSED
  // A's parent = null → skip
  const result = findBypassed(commits, knownParentHashes);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].hash, 'X');
});

test('findBypassed skips initial commit (null parentHash)', () => {
  const commits = [
    { hash: 'A', parentHash: null, author: 'x@y.com', timestamp: 't0' },
  ];
  const result = findBypassed(commits, []);
  assert.strictEqual(result.length, 0);
});

test('findBypassed returns empty when no commits', () => {
  const result = findBypassed([], []);
  assert.strictEqual(result.length, 0);
});

test('findBypassed handles multiple bypasses', () => {
  const commits = [
    { hash: 'D', parentHash: 'C', author: 'x@y.com', timestamp: 't3' },
    { hash: 'C', parentHash: 'B', author: 'x@y.com', timestamp: 't2' },
    { hash: 'B', parentHash: 'A', author: 'x@y.com', timestamp: 't1' },
    { hash: 'A', parentHash: null, author: 'x@y.com', timestamp: 't0' },
  ];
  // Only session: prev_hash = 'C' (D was reviewed, B and C were bypassed)
  const knownParentHashes = ['C'];
  // D's parent = C, C in set → not bypassed
  // C's parent = B, B NOT in set → bypassed
  // B's parent = A, A NOT in set → bypassed
  // A's parent = null → skip
  const result = findBypassed(commits, knownParentHashes);
  assert.strictEqual(result.length, 2);
  const hashes = result.map(c => c.hash);
  assert.ok(hashes.includes('C'));
  assert.ok(hashes.includes('B'));
});
