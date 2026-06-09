import { writeFileSync, chmodSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { HistoryDB }    from '../core/history-db.js';
import { statusLine }   from '../core/ui.js';
import pc               from 'picocolors';

const HOOK_SCRIPT = `#!/bin/sh
# Guardrails pre-commit hook — installed by: guardrails install
# Do not edit manually. Re-run 'guardrails install' to update.

guardrails review
`;

export function generateHookScript() {
  return HOOK_SCRIPT;
}

export async function install() {
  // Find the git root
  let gitRoot;
  try {
    gitRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  } catch {
    console.error('Error: Not inside a git repository.');
    process.exit(1);
  }

  const hooksDir = join(gitRoot, '.git', 'hooks');
  const hookPath = join(hooksDir, 'pre-commit');

  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  // Check for existing hook
  if (existsSync(hookPath)) {
    console.warn('Warning: Existing pre-commit hook found. Overwriting.');
  }

  writeFileSync(hookPath, HOOK_SCRIPT);

  // Make executable on Unix
  try {
    chmodSync(hookPath, '755');
  } catch {
    // chmod may fail on Windows — not a problem
  }

  try {
    const db = new HistoryDB();
    db.close();
    console.log(statusLine('ok', 'History database', `~/.guardrails/history.db`));
  } catch (e) {
    console.log(statusLine('warn', 'History database', `could not create: ${e.message}`));
  }

  console.log(`\n${pc.green('✓')} Guardrails installed. It will run on every git commit.\n`);
}
