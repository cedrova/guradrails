import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HistoryDB } from '../../src/core/history-db.js';
import { randomUUID } from 'node:crypto';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TEST_DB = join(tmpdir(), 'guardrails-test-history.db');

function freshDB() {
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  return new HistoryDB(TEST_DB);
}

test('insertSession and getAllSessions returns inserted record', () => {
  const db = freshDB();
  const id = randomUUID();
  db.insertSession({ id, prev_hash: 'abc123', author: 'x@y.com',
    timestamp: '2024-01-01T00:00:00Z', result: 'pass' });
  const sessions = db.getAllSessions();
  assert.strictEqual(sessions.length, 1);
  assert.strictEqual(sessions[0].id, id);
  assert.strictEqual(sessions[0].prev_hash, 'abc123');
  assert.strictEqual(sessions[0].result, 'pass');
  db.close();
});

test('insertViolation links to session', () => {
  const db = freshDB();
  const sid = randomUUID();
  db.insertSession({ id: sid, prev_hash: 'abc123', author: 'x@y.com',
    timestamp: '2024-01-01T00:00:00Z', result: 'fail' });
  db.insertViolation({ session_id: sid, file_name: 'src/index.js',
    file_hash: 'filehash1', rule_id: 'no-console-log', rule_type: 'static' });
  const stats = db.getStats();
  assert.strictEqual(stats.violations, 1);
  db.close();
});

test('getKnownParentHashes returns all prev_hash values', () => {
  const db = freshDB();
  db.insertSession({ id: randomUUID(), prev_hash: 'aaa', author: 'a@b.com',
    timestamp: '2024-01-01T00:00:00Z', result: 'pass' });
  db.insertSession({ id: randomUUID(), prev_hash: 'bbb', author: 'a@b.com',
    timestamp: '2024-01-01T01:00:00Z', result: 'pass' });
  const hashes = db.getKnownParentHashes();
  assert.ok(hashes.includes('aaa'));
  assert.ok(hashes.includes('bbb'));
  db.close();
});

test('markBypassed inserts a bypass session record', () => {
  const db = freshDB();
  db.markBypassed('deadbeef', 'x@y.com', '2024-01-01T00:00:00Z');
  const sessions = db.getAllSessions();
  assert.strictEqual(sessions.length, 1);
  assert.strictEqual(sessions[0].bypassed, 1);
  assert.strictEqual(sessions[0].result, 'bypass');
  db.close();
});

test('markBypassed does not insert duplicate for same commit_hash', () => {
  const db = freshDB();
  db.markBypassed('deadbeef', 'x@y.com', '2024-01-01T00:00:00Z');
  db.markBypassed('deadbeef', 'x@y.com', '2024-01-01T00:00:00Z');
  const sessions = db.getAllSessions();
  assert.strictEqual(sessions.length, 1);
  db.close();
});

test('getStats returns correct totals', () => {
  const db = freshDB();
  const sid = randomUUID();
  db.insertSession({ id: sid, prev_hash: 'aaa', author: 'a@b.com',
    timestamp: '2024-01-01T00:00:00Z', result: 'fail' });
  db.insertViolation({ session_id: sid, file_name: 'src/a.js',
    file_hash: 'h1', rule_id: 'no-console-log', rule_type: 'static' });
  db.markBypassed('bbb', 'b@c.com', '2024-01-01T01:00:00Z');
  const stats = db.getStats();
  assert.strictEqual(stats.total, 2);
  assert.strictEqual(stats.bypassed, 1);
  assert.strictEqual(stats.violations, 1);
  db.close();
});
