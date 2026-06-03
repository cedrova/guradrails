import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Create API routes.
 * All /api/* routes require DASHBOARD_KEY in Authorization header.
 */
export function createApiRoutes(db) {
  const router = Router();

  // Auth middleware for API routes
  router.use((req, res, next) => {
    const key = process.env.DASHBOARD_KEY;
    if (!key) {
      return res.status(500).json({ error: 'DASHBOARD_KEY not configured on server' });
    }
    const provided = req.headers.authorization?.replace('Bearer ', '');
    if (provided !== key) {
      return res.status(401).json({ error: 'Invalid or missing authorization key' });
    }
    next();
  });

  // POST /api/commits — receive commit data from CLI
  router.post('/commits', (req, res) => {
    const { commit_hash, author, timestamp, result, bypassed, files } = req.body;

    if (!commit_hash || !author || !timestamp) {
      return res.status(400).json({ error: 'Missing required fields: commit_hash, author, timestamp' });
    }

    const commitId = uuidv4();
    db.insertCommit({
      id: commitId,
      commit_hash,
      author,
      timestamp,
      bypassed: bypassed ? 1 : 0,
    });

    // Insert violations if any
    if (files && Array.isArray(files)) {
      for (const file of files) {
        for (const ruleId of (file.rule_ids || [])) {
          db.insertViolation({
            id: uuidv4(),
            commit_id: commitId,
            file_name: file.file_name || null,
            file_hash: file.file_hash || null,
            rule_id: ruleId,
          });
        }
      }
    }

    res.status(201).json({ id: commitId });
  });

  // GET /api/commits — list recent commits
  router.get('/commits', (req, res) => {
    const limit = parseInt(req.query.limit || '100', 10);
    const commits = db.getAllCommits(limit);
    res.json(commits);
  });

  // GET /api/violations — list recent violations
  router.get('/violations', (req, res) => {
    const limit = parseInt(req.query.limit || '200', 10);
    const violations = db.getAllViolations(limit);
    res.json(violations);
  });

  // GET /api/stats — summary statistics
  router.get('/stats', (req, res) => {
    const stats = db.getStats();
    res.json(stats);
  });

  return router;
}
