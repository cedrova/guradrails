import { execSync }     from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

import { getStagedDiff, getCIDiff, estimateTokens,
         getDiffWarning, splitDiffByFile }  from './diff.js';
import { loadRules }         from './rule-loader.js';
import { runStaticChecks }   from './static-runner.js';
import { buildPrompt }       from './prompt-builder.js';
import { createLLMClient }   from './llm-client.js';
import { listLocalModels, pullModel } from './ollama-client.js';
import { parseResponse }     from './response-parser.js';
import { Cache }             from './cache.js';
import { createTelemetry }   from './telemetry.js';
import { reconcileBypasses } from './bypass.js';
import { HistoryDB }         from './history-db.js';
import { createSpinner, formatViolationTable } from './ui.js';

/**
 * Main pipeline entry point.
 * @param {object} options
 * @param {boolean} options.ci - true when running in CI mode (--ci flag)
 * @returns {number} exit code — 0 for pass, 1 for fail
 */
export async function runPipeline(options = {}) {
  const { ci = false } = options;

  // ── Session identity ───────────────────────────────────────────────────────
  // We generate a UUID as the primary identifier because git rev-parse HEAD
  // during pre-commit returns the PREVIOUS commit's hash, not the current one.
  // The previous hash is stored as prev_hash (watermark for bypass detection).
  const sessionId = randomUUID();
  const prevHash  = getHeadHash();   // intentionally the previous commit's hash
  const author    = getAuthor();

  // ── 1. Load rules ──────────────────────────────────────────────────────────
  let rules, config;
  try {
    const loaded = loadRules(process.cwd());
    rules   = loaded.rules;
    config  = loaded.config;
    for (const w of loaded.warnings) {
      process.stderr.write(`[guardrails warn] ${w}\n`);
    }
  } catch (e) {
    process.stderr.write(`Guardrails: ${e.message}\n`);
    return 0; // fail open — missing config is not a code violation
  }

  const historyDb = openHistoryDB();

  // ── 2. Bypass reconciliation (hook mode only) ─────────────────────────────
  if (!ci) {
    try {
      const bypassed = await reconcileBypasses(historyDb, config.bypass_lookback || 10);
      if (bypassed.length > 0) {
        process.stderr.write(
          `[guardrails] Detected ${bypassed.length} bypassed commit(s) since last review.\n`
        );
      }
    } catch { /* bypass reconciliation failure is non-blocking */ }
  }

  // ── 3. Get diff ────────────────────────────────────────────────────────────
  let diffText;
  try {
    diffText = ci ? getCIDiff() : getStagedDiff();
  } catch (e) {
    process.stderr.write(`Guardrails: ${e.message}\n`);
    closeHistoryDB(historyDb);
    return 0;
  }

  if (!diffText?.trim()) {
    closeHistoryDB(historyDb);
    return 0;
  }

  // ── 4. Token warning ───────────────────────────────────────────────────────
  const tokens  = estimateTokens(diffText);
  const warning = getDiffWarning(tokens);
  if (warning?.level === 'warn') {
    process.stdout.write(`⚠  ${warning.message}\n`);
  }

  // ── 5. Split by file ───────────────────────────────────────────────────────
  const files = splitDiffByFile(diffText);
  if (files.length === 0) {
    closeHistoryDB(historyDb);
    return 0;
  }

  const allViolations = [];
  const cache         = new Cache();
  const llmClient     = createLLMClient(config);
  const staticRules   = rules.filter(r => r.type === 'static');
  const llmRules      = rules.filter(r => r.type === 'llm');

  // ── 6. Ollama model auto-pull safety net ───────────────────────────────────
  const isOllama = !config.llm_provider ||
                    config.llm_provider === 'ollama';
  if (!ci && isOllama && llmRules.length > 0) {
    const models = await listLocalModels();
    if (!models.some(m => m === config.model || m.startsWith(config.model + ':'))) {
      process.stdout.write(
        `\nGuardrails: model '${config.model}' not found in Ollama.\n` +
        `Auto-pulling now... (this takes 1–2 minutes on first run)\n\n`
      );
      try {
        await pullModel(config.model);
        process.stdout.write('\n');
      } catch (e) {
        process.stderr.write(`Could not pull model: ${e.message}. LLM rules will be skipped.\n`);
        // Still run static checks — don't abort
      }
    }
  }

  // ── 7. Static checks ───────────────────────────────────────────────────────
  for (const file of files) {
    const violations = runStaticChecks(file.diff, staticRules, config);
    allViolations.push(
      ...violations.map(v => ({ ...v, file: file.filePath }))
    );
  }

  if (allViolations.length > 0) {
    process.stdout.write(formatViolationTable(allViolations));
    await persist(historyDb, sessionId, prevHash, author, 'fail', allViolations, config);
    if (ci) await postCIComment(allViolations);
    closeHistoryDB(historyDb);
    cache.save();
    return 1;
  }

  // ── 8. LLM review ─────────────────────────────────────────────────────────
  if (llmRules.length > 0) {
    for (const file of files) {
      const cached = cache.get(file.filePath, file.diff);
      if (cached) {
        if (cached.status === 'fail') {
          allViolations.push(
            ...cached.violations.map(v => ({ ...v, type: 'llm', file: file.filePath }))
          );
        }
        continue;
      }

      const spinner = createSpinner(`Reviewing ${file.filePath}...`);
      spinner.start();

      try {
        const prompt = buildPrompt(llmRules, file.diff);
        const raw    = await llmClient.generate(prompt);
        const result = parseResponse(raw);

        cache.set(file.filePath, file.diff, result);

        if (result.status === 'infrastructure_error') {
          spinner.warn(`Malformed response for ${file.filePath} — skipping`);
          continue;
        }

        if (result.status === 'fail') {
          spinner.fail(`${file.filePath} — ${result.violations.length} violation(s)`);
          allViolations.push(
            ...result.violations.map(v => ({ ...v, type: 'llm', file: file.filePath }))
          );
        } else {
          spinner.succeed(`${file.filePath} — passed`);
        }
      } catch (e) {
        spinner.warn(`${e.message} — skipping ${file.filePath}`);
      }
    }
  }

  cache.save();

  // ── 9. Final result ────────────────────────────────────────────────────────
  if (allViolations.length > 0) {
    process.stdout.write(formatViolationTable(allViolations));
    await persist(historyDb, sessionId, prevHash, author, 'fail', allViolations, config);
    if (ci) await postCIComment(allViolations);
    closeHistoryDB(historyDb);
    return 1;
  }

  process.stdout.write('\n✓ Guardrails: all checks passed\n\n');
  await persist(historyDb, sessionId, prevHash, author, 'pass', [], config);
  closeHistoryDB(historyDb);
  return 0;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getHeadHash() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch { return null; }
}

function getAuthor() {
  try {
    return execSync('git config user.email', { encoding: 'utf8' }).trim();
  } catch { return 'unknown'; }
}

// HistoryDB is imported at the top of the file (see import block above).
// Do NOT use dynamic import() here — it returns a Promise inside a sync function.
function openHistoryDB() {
  try { return new HistoryDB(); } catch { return null; }
}

function closeHistoryDB(db) {
  try { db?.close(); } catch { /* non-blocking */ }
}

async function persist(db, sessionId, prevHash, author, result, violations, config) {
  if (!db) return;
  try {
    db.insertSession({
      id: sessionId,
      prev_hash: prevHash,
      author,
      timestamp: new Date().toISOString(),
      result,
    });

    for (const v of violations) {
      const fileHash = v.file
        ? createHash('sha256').update(v.file).digest('hex')
        : null;
      db.insertViolation({
        session_id: sessionId,
        file_name:  config.privacy_mode === 'strict' ? null : (v.file ?? null),
        file_hash:  fileHash,
        rule_id:    v.rule,
        rule_type:  v.type,
      });
    }

    // Also push to remote dashboard telemetry if configured
    const telemetry = createTelemetry(config);
    await telemetry.send({
      commit_hash: sessionId,
      author,
      timestamp: new Date().toISOString(),
      result,
      files: violations.length > 0
        ? [...new Set(violations.map(v => v.file))].map(f => ({
            file_name: config.privacy_mode === 'strict' ? null : f,
            rule_ids:  violations.filter(v => v.file === f).map(v => v.rule),
          }))
        : [],
    });
  } catch { /* persistence failure is non-blocking */ }
}

async function postCIComment(violations) {
  try {
    const { postPRComment } = await import('./ci-reporter.js');
    await postPRComment(violations);
  } catch { /* non-blocking */ }
}
