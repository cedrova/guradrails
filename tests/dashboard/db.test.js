import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DashboardDB } from '../../src/dashboard/db.js';

describe('DashboardDB', () => {
  let db;

  beforeEach(() => {
    db = new DashboardDB(':memory:');
  });

  it('inserts and retrieves a commit', () => {
    db.insertCommit({
      id: 'uuid-1',
      commit_hash: 'abc123',
      author: 'dev@test.com',
      timestamp: '2025-01-01T00:00:00Z',
      bypassed: 0,
    });
    const commits = db.getAllCommits();
    assert.equal(commits.length, 1);
    assert.equal(commits[0].commit_hash, 'abc123');
  });

  it('inserts and retrieves violations', () => {
    db.insertCommit({
      id: 'uuid-1',
      commit_hash: 'abc123',
      author: 'dev@test.com',
      timestamp: '2025-01-01T00:00:00Z',
      bypassed: 0,
    });
    db.insertViolation({
      id: 'v-1',
      commit_id: 'uuid-1',
      file_name: 'auth.ts',
      file_hash: 'hashvalue',
      rule_id: 'no-raw-sql',
    });
    const violations = db.getViolationsForCommit('uuid-1');
    assert.equal(violations.length, 1);
    assert.equal(violations[0].rule_id, 'no-raw-sql');
  });

  it('marks commits as bypassed', () => {
    db.markBypassed('abc123', 'dev@test.com', '2025-01-01T00:00:00Z');
    const commits = db.getAllCommits();
    assert.equal(commits.length, 1);
    assert.equal(commits[0].bypassed, 1);
  });

  it('returns known hashes', () => {
    db.insertCommit({
      id: 'uuid-1',
      commit_hash: 'aaa',
      author: 'dev@test.com',
      timestamp: '2025-01-01T00:00:00Z',
      bypassed: 0,
    });
    const known = db.getKnownHashes(['aaa', 'bbb']);
    assert.deepEqual(known, ['aaa']);
  });

  it('returns summary stats', () => {
    db.insertCommit({
      id: 'uuid-1',
      commit_hash: 'aaa',
      author: 'dev@test.com',
      timestamp: '2025-01-01T00:00:00Z',
      bypassed: 0,
    });
    db.insertCommit({
      id: 'uuid-2',
      commit_hash: 'bbb',
      author: 'dev@test.com',
      timestamp: '2025-01-02T00:00:00Z',
      bypassed: 1,
    });
    const stats = db.getStats();
    assert.equal(stats.totalCommits, 2);
    assert.equal(stats.bypassedCommits, 1);
  });
});
