import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class DashboardDB {
  constructor(dbPath = './data/guardrails.db') {
    if (dbPath !== ':memory:') {
      const dir = dirname(dbPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this._migrate();
  }

  _migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS commits (
        id          TEXT PRIMARY KEY,
        commit_hash TEXT NOT NULL,
        author      TEXT NOT NULL,
        timestamp   TEXT NOT NULL,
        bypassed    INTEGER DEFAULT 0,
        session_id  TEXT
      );

      CREATE TABLE IF NOT EXISTS violations (
        id          TEXT PRIMARY KEY,
        commit_id   TEXT REFERENCES commits(id),
        file_name   TEXT,
        file_hash   TEXT,
        rule_id     TEXT NOT NULL,
        resolved    INTEGER DEFAULT 0,
        session_id  TEXT
      );
    `);
  }

  insertCommit({ id, commit_hash, author, timestamp, bypassed = 0 }) {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO commits (id, commit_hash, author, timestamp, bypassed)
       VALUES (?, ?, ?, ?, ?)`
    );
    stmt.run(id || uuidv4(), commit_hash, author, timestamp, bypassed);
  }

  insertViolation({ id, commit_id, file_name, file_hash, rule_id }) {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO violations (id, commit_id, file_name, file_hash, rule_id)
       VALUES (?, ?, ?, ?, ?)`
    );
    stmt.run(id || uuidv4(), commit_id, file_name, file_hash, rule_id);
  }

  markBypassed(commit_hash, author, timestamp) {
    // Check if this commit is already recorded
    const existing = this.db.prepare(
      'SELECT id FROM commits WHERE commit_hash = ?'
    ).get(commit_hash);

    if (!existing) {
      this.insertCommit({
        id: uuidv4(),
        commit_hash,
        author,
        timestamp,
        bypassed: 1,
      });
    }
  }

  getKnownHashes(hashes) {
    if (hashes.length === 0) return [];
    const placeholders = hashes.map(() => '?').join(',');
    const rows = this.db.prepare(
      `SELECT commit_hash FROM commits WHERE commit_hash IN (${placeholders})`
    ).all(...hashes);
    return rows.map(r => r.commit_hash);
  }

  getAllCommits(limit = 100) {
    return this.db.prepare(
      'SELECT * FROM commits ORDER BY timestamp DESC LIMIT ?'
    ).all(limit);
  }

  getViolationsForCommit(commitId) {
    return this.db.prepare(
      'SELECT * FROM violations WHERE commit_id = ?'
    ).all(commitId);
  }

  getAllViolations(limit = 200) {
    return this.db.prepare(
      `SELECT v.*, c.commit_hash, c.author, c.timestamp
       FROM violations v
       JOIN commits c ON v.commit_id = c.id
       ORDER BY c.timestamp DESC
       LIMIT ?`
    ).all(limit);
  }

  getStats() {
    const totalCommits = this.db.prepare('SELECT COUNT(*) as count FROM commits').get().count;
    const bypassedCommits = this.db.prepare('SELECT COUNT(*) as count FROM commits WHERE bypassed = 1').get().count;
    const totalViolations = this.db.prepare('SELECT COUNT(*) as count FROM violations').get().count;
    const topRules = this.db.prepare(
      `SELECT rule_id, COUNT(*) as count FROM violations
       GROUP BY rule_id ORDER BY count DESC LIMIT 10`
    ).all();

    return { totalCommits, bypassedCommits, totalViolations, topRules };
  }

  close() {
    this.db.close();
  }
}
