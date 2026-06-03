import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

/**
 * Lightweight local SQLite database for the pre-commit pipeline.
 * Stores only the commits table — used for bypass detection and
 * recording which commits were reviewed.
 *
 * Located at ~/.guardrails/local.db (separate from the dashboard DB).
 * This DB always exists, even without the dashboard.
 */
export class LocalDB {
  constructor(dbPath = null) {
    if (!dbPath || dbPath === ':memory:') {
      this.db = new Database(dbPath || ':memory:');
    } else {
      const dir = dirname(dbPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      this.db = new Database(dbPath);
    }
    this.db.pragma('journal_mode = WAL');
    this._migrate();
  }

  _migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS commits (
        commit_hash TEXT PRIMARY KEY,
        author      TEXT NOT NULL,
        timestamp   TEXT NOT NULL,
        bypassed    INTEGER DEFAULT 0
      );
    `);
  }

  /**
   * Record a reviewed commit.
   */
  insertCommit(commitHash, author, timestamp) {
    this.db.prepare(
      `INSERT OR IGNORE INTO commits (commit_hash, author, timestamp, bypassed)
       VALUES (?, ?, ?, 0)`
    ).run(commitHash, author, timestamp);
  }

  /**
   * Mark a commit as bypassed (found in git log but not in commits table).
   */
  markBypassed(commitHash, author, timestamp) {
    const existing = this.db.prepare(
      'SELECT commit_hash FROM commits WHERE commit_hash = ?'
    ).get(commitHash);

    if (!existing) {
      this.db.prepare(
        `INSERT INTO commits (commit_hash, author, timestamp, bypassed)
         VALUES (?, ?, ?, 1)`
      ).run(commitHash, author, timestamp);
    }
  }

  /**
   * Return which of the given hashes are already in the commits table.
   */
  getKnownHashes(hashes) {
    if (hashes.length === 0) return [];
    const placeholders = hashes.map(() => '?').join(',');
    const rows = this.db.prepare(
      `SELECT commit_hash FROM commits WHERE commit_hash IN (${placeholders})`
    ).all(...hashes);
    return rows.map(r => r.commit_hash);
  }

  close() {
    this.db.close();
  }
}

/**
 * Default path for the local DB.
 */
export function getLocalDBPath() {
  return join(homedir(), '.guardrails', 'local.db');
}
