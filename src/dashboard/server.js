import express from 'express';
import { mkdirSync, existsSync } from 'node:fs';
import { DashboardDB } from './db.js';
import { createApiRoutes } from './routes/api.js';
import { createPageRoutes } from './routes/pages.js';

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || './data';
const DB_PATH = `${DATA_DIR}/guardrails.db`;

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const db = new DashboardDB(DB_PATH);
const app = express();

app.use(express.json());

// Routes
app.use('/api', createApiRoutes(db));
app.use('/', createPageRoutes());

// Root redirect
app.get('/', (req, res) => {
  res.redirect('/demo');
});

app.listen(PORT, () => {
  console.log(`\n🛡️  Guardrails Dashboard running at http://localhost:${PORT}`);
  console.log(`   Demo:      http://localhost:${PORT}/demo`);
  console.log(`   Dashboard: http://localhost:${PORT}/dashboard?key=YOUR_KEY\n`);
});

export { app, db };
