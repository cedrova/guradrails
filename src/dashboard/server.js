import express      from 'express';
import { join }     from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import Database     from 'better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * Creates and starts the dashboard HTTP server.
 *
 * @param {object} options
 * @param {string}  [options.dbPath]    - Path to SQLite DB. Defaults to ./data/guardrails.db
 *                                        or $DATA_DIR/guardrails.db when DATA_DIR is set.
 * @param {boolean} [options.localMode] - If true, /dashboard is auto-authenticated (no key needed).
 *                                        Used by `guardrails dashboard` for local viewing.
 * @param {number}  [options.port]      - Port to listen on. Defaults to 3000.
 * @returns {Promise<import('http').Server>}
 */
export async function createServer(options = {}) {
  const {
    dbPath    = process.env.DATA_DIR
                ? join(process.env.DATA_DIR, 'guardrails.db')
                : join(process.cwd(), 'data', 'guardrails.db'),
    localMode = false,
    port      = 3000,
  } = options;

  // Ensure the database directory exists
  const dbDir = join(dbPath, '..');
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

  // Open database (creates it if it doesn't exist)
  const db = new Database(dbPath);
  db.exec(`
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

  const app = express();
  app.use(express.json());

  // ── Static files ───────────────────────────────────────────────────────────
  app.use(express.static(join(__dirname, 'public')));

  // ── Auth middleware for protected routes ───────────────────────────────────
  function requireKey(req, res, next) {
    if (localMode) return next();  // auto-authenticate in local mode
    const key = req.query.key || req.headers.authorization?.replace('Bearer ', '');
    if (!process.env.DASHBOARD_KEY || key !== process.env.DASHBOARD_KEY) {
      return res.status(401).json({ error: 'Unauthorized — provide ?key=YOUR_DASHBOARD_KEY' });
    }
    next();
  }

  // ── Pages ──────────────────────────────────────────────────────────────────
  app.get('/', (req, res) => {
    res.redirect('/demo');
  });

  app.get('/demo', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'demo.html'));
  });

  app.get('/dashboard', (req, res) => {
    // In localMode: auto-pass. In server mode: client sends key as query param.
    // The dashboard.html JS reads it from ?key= and passes it in API headers.
    // The page itself is always served — auth is enforced at the API level.
    res.sendFile(join(__dirname, 'public', 'dashboard.html'));
  });

  // ── API — Stats ────────────────────────────────────────────────────────────
  app.get('/api/stats', requireKey, (req, res) => {
    const total      = db.prepare('SELECT COUNT(*) as c FROM sessions').get().c;
    const bypassed   = db.prepare('SELECT COUNT(*) as c FROM sessions WHERE bypassed = 1').get().c;
    const violations = db.prepare('SELECT COUNT(*) as c FROM violations').get().c;
    res.json({ total, bypassed, violations });
  });

  // ── API — Commits (sessions list) ──────────────────────────────────────────
  app.get('/api/commits', requireKey, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const sessions = db.prepare(
      `SELECT s.*, COUNT(v.id) as violation_count
       FROM sessions s
       LEFT JOIN violations v ON v.session_id = s.id
       GROUP BY s.id
       ORDER BY s.timestamp DESC
       LIMIT ?`
    ).all(limit);
    res.json(sessions);
  });

  // ── API — Ingest from CLI telemetry ───────────────────────────────────────
  app.post('/api/commits', requireKey, (req, res) => {
    const { commit_hash, author, timestamp, result, files = [] } = req.body;
    if (!commit_hash || !author || !timestamp || !result) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const sessionId = randomUUID();

    db.prepare(
      `INSERT OR IGNORE INTO sessions (id, prev_hash, author, timestamp, result)
       VALUES (?, ?, ?, ?, ?)`
    ).run(sessionId, commit_hash, author, timestamp, result);

    for (const file of files) {
      for (const rule_id of (file.rule_ids || [])) {
        db.prepare(
          `INSERT INTO violations (id, session_id, file_name, file_hash, rule_id, rule_type)
           VALUES (?, ?, ?, ?, ?, 'llm')`
        ).run(randomUUID(), sessionId, file.file_name ?? null, null, rule_id);
      }
    }

    res.status(201).json({ ok: true, session_id: sessionId });
  });

  // ── Start ──────────────────────────────────────────────────────────────────
  return new Promise((resolve) => {
    const httpServer = app.listen(port, () => resolve(httpServer));
  });
}

// Allow running as standalone: node src/dashboard/server.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().then(server => {
    const { port } = server.address();
    console.log(`🛡️  Guardrails Dashboard running at http://localhost:${port}`);
  });
}
