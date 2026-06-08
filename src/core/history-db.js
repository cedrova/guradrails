import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

export const HISTORY_DIR  = join(homedir(), '.guardrails');
export const HISTORY_PATH = join(HISTORY_DIR, 'history.db');

export class HistoryDB {
  constructor(dbPath = HISTORY_PATH) {
    const dir = join(dbPath, '..');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.db = new Database(dbPath);
    this._init();
  }

  _init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id         TEXT PRIMARY KEY,
        prev_hash  TEXT,
        author     TEXT NOT NULL,
        timestamp  TEXT NOT NULL,
        result     TEXT NOT NULL,
        bypassed   INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS violations (
        id         TEXT PRIMARY KEY,
        session_id TEXT REFERENCES sessions(id),
        file_name  TEXT,
        file_hash  TEXT,
        rule_id    TEXT NOT NULL,
        rule_type  TEXT NOT NULL
      );
    `);
  }

  insertSession({ id, prev_hash, author, timestamp, result }) {
    this.db.prepare(
      `INSERT OR IGNORE INTO sessions (id, prev_hash, author, timestamp, result)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, prev_hash ?? null, author, timestamp, result);
  }

  insertViolation({ session_id, file_name, file_hash, rule_id, rule_type }) {
    this.db.prepare(
      `INSERT INTO violations (id, session_id, file_name, file_hash, rule_id, rule_type)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(randomUUID(), session_id, file_name ?? null, file_hash ?? null, rule_id, rule_type);
  }

  markBypassed(commit_hash, author, timestamp) {
    const existing = this.db.prepare(
      `SELECT id FROM sessions WHERE prev_hash = ? AND bypassed = 1`
    ).get(commit_hash);
    if (existing) return;
    this.db.prepare(
      `INSERT INTO sessions (id, prev_hash, author, timestamp, result, bypassed)
       VALUES (?, ?, ?, ?, 'bypass', 1)`
    ).run(randomUUID(), commit_hash, author ?? 'unknown', timestamp);
  }

  getAllSessions() {
    return this.db.prepare(
      'SELECT * FROM sessions ORDER BY timestamp DESC'
    ).all();
  }

  getKnownParentHashes() {
    return this.db.prepare(
      'SELECT prev_hash FROM sessions WHERE prev_hash IS NOT NULL'
    ).all().map(r => r.prev_hash);
  }

  getStats() {
    const total     = this.db.prepare('SELECT COUNT(*) as c FROM sessions').get().c;
    const bypassed  = this.db.prepare('SELECT COUNT(*) as c FROM sessions WHERE bypassed = 1').get().c;
    const violations = this.db.prepare('SELECT COUNT(*) as c FROM violations').get().c;
    return { total, bypassed, violations };
  }

  close() {
    this.db.close();
  }
}
