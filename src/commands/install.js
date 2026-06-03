import { writeFileSync, chmodSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

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

  console.log(`✓ Pre-commit hook installed at ${hookPath}`);
  console.log('  Every commit will now be reviewed by Guardrails.');
}
