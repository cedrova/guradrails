import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { LocalDB } from '../../src/core/local-db.js';

describe('LocalDB', () => {
  let db;

  beforeEach(() => {
    db = new LocalDB(':memory:');
  });

  it('inserts a reviewed commit and retrieves its hash', () => {
    db.insertCommit('abc123def456', 'dev@test.com', '2025-01-01T00:00:00Z');
    const known = db.getKnownHashes(['abc123def456', 'unknown']);
    assert.deepEqual(known, ['abc123def456']);
  });

  it('marks a bypassed commit', () => {
    db.markBypassed('abc123def456', 'dev@test.com', '2025-01-01T00:00:00Z');
    const known = db.getKnownHashes(['abc123def456']);
    assert.deepEqual(known, ['abc123def456']);
  });

  it('does not duplicate on re-insert', () => {
    db.insertCommit('abc123def456', 'dev@test.com', '2025-01-01T00:00:00Z');
    db.insertCommit('abc123def456', 'dev@test.com', '2025-01-01T00:00:00Z');
    const known = db.getKnownHashes(['abc123def456']);
    assert.equal(known.length, 1);
  });

  it('returns empty array when no hashes match', () => {
    const known = db.getKnownHashes(['nonexistent']);
    assert.deepEqual(known, []);
  });

  it('handles empty hash list', () => {
    const known = db.getKnownHashes([]);
    assert.deepEqual(known, []);
  });
});
