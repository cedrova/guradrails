import { Router } from 'express';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createPageRoutes() {
  const router = Router();

  // Public demo page — no auth
  router.get('/demo', (req, res) => {
    res.sendFile(join(__dirname, '..', 'public', 'demo.html'));
  });

  // Protected dashboard — checks key via query param or header
  router.get('/dashboard', (req, res) => {
    const key = process.env.DASHBOARD_KEY;
    const provided = req.query.key || req.headers['x-dashboard-key'];

    if (!key || provided !== key) {
      return res.status(401).send(
        '<h1>Unauthorized</h1><p>Provide ?key=YOUR_DASHBOARD_KEY in the URL.</p>'
      );
    }

    res.sendFile(join(__dirname, '..', 'public', 'dashboard.html'));
  });

  return router;
}
