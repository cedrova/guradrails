import { getStagedDiff, estimateTokens, getDiffWarning, splitDiffByFile } from './diff.js';
import { loadRules } from './rule-loader.js';
import { runStaticChecks } from './static-runner.js';
import { buildPrompt } from './prompt-builder.js';
import { generate } from './ollama-client.js';
import { parseResponse } from './response-parser.js';
import { Cache } from './cache.js';
import { createTelemetry } from './telemetry.js';
import { reconcileBypasses } from './bypass.js';
import { LocalDB, getLocalDBPath } from './local-db.js';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

/**
 * Format violations for terminal output.
 */
function formatViolations(violations) {
  if (violations.length === 0) return '';
  let output = '\n🚫 Guardrails: commit blocked\n\n';
  for (const v of violations) {
    if (v.type === 'static') {
      output += `  [static] ${v.rule}\n`;
    } else {
      output += `  [llm] ${v.rule}\n`;
      if (v.reason) output += `         ${v.reason}\n`;
    }
  }
  output += `\n${violations.length} violation(s) found. Fix the issues above and try again.\n`;
  return output;
}

/**
 * Run the full pre-commit review pipeline.
 * Returns exit code: 0 = allow, 1 = block.
 */
export async function runPipeline() {
  // Generate a session ID for this review run.
  // We use a UUID instead of git rev-parse HEAD because the commit
  // object doesn't exist yet at pre-commit time — HEAD still points
  // to the previous commit. This is a known v1 limitation.
  const sessionId = randomUUID();

  // 1. Load rules and config
  let rules, config;
  try {
    const loaded = loadRules(process.cwd());
    rules = loaded.rules;
    config = loaded.config;
    for (const w of loaded.warnings) {
      console.warn(`[guardrails] ${w}`);
    }
  } catch (e) {
    console.log(`Guardrails: ${e.message}`);
    return 0; // fail open — no rule file
  }

  // 2. Bypass reconciliation — ALWAYS runs before the current review.
  // Uses the local SQLite DB at ~/.guardrails/local.db.
  // This is independent of the optional dashboard.
  let localDb;
  try {
    localDb = new LocalDB(getLocalDBPath());
    const bypassed = await reconcileBypasses(localDb, config.bypass_lookback || 10);
    if (bypassed.length > 0) {
      console.log(`[guardrails] ${bypassed.length} bypassed commit(s) detected and recorded.`);
    }
  } catch (e) {
    // Local DB failure is non-blocking — log and continue
    console.warn(`[guardrails] bypass check failed: ${e.message}`);
  } finally {
    if (localDb) {
      try {
        localDb.close();
      } catch {}
    }
  }

  // 3. Get staged diff
  let diffText;
  try {
    diffText = getStagedDiff();
  } catch (e) {
    console.log(`Guardrails: ${e.message}`);
    return 0;
  }

  if (!diffText.trim()) {
    return 0; // nothing to review
  }

  // 4. Token estimation + warnings
  const tokens = estimateTokens(diffText);
  const warning = getDiffWarning(tokens);
  if (warning && warning.level === 'warn') {
    console.log(`⚠️  ${warning.message}`);
  }

  // 5. Split by file (always — for caching and per-file review)
  const files = splitDiffByFile(diffText);
  if (files.length === 0) return 0;

  const allViolations = [];
  const cache = new Cache();
  const telemetry = createTelemetry(config);
  const author = getAuthor();

  // 6. Static checks first (on each file's diff)
  const staticRules = rules.filter(r => r.type === 'static');
  const llmRules = rules.filter(r => r.type === 'llm');

  for (const file of files) {
    const staticViolations = runStaticChecks(file.diff, staticRules, config);
    allViolations.push(...staticViolations.map(v => ({ ...v, file: file.filePath })));
  }

  // If static rules already block, skip LLM entirely
  if (allViolations.length > 0) {
    console.log(formatViolations(allViolations));
    // Telemetry — uses sessionId, not a commit hash
    try {
      await telemetry.send({
        commit_hash: sessionId,
        author,
        timestamp: new Date().toISOString(),
        result: 'fail',
        files: allViolations.map(v => ({
          file_name: v.file,
          rule_ids: [v.rule],
        })),
      });
    } catch { /* non-blocking */ }
    cache.save();
    return 1;
  }

  // 7. LLM review for each file (if there are LLM rules)
  if (llmRules.length > 0) {
    const shouldSplit = warning && warning.level === 'split';
    if (shouldSplit) {
      console.log(`📂 ${warning.message}`);
    }

    for (const file of files) {
      // Check cache
      const cached = cache.get(file.filePath, file.diff);
      if (cached) {
        if (cached.status === 'fail') {
          allViolations.push(
            ...cached.violations.map(v => ({
              rule: v.rule,
              reason: v.reason,
              type: 'llm',
              file: file.filePath,
            }))
          );
        }
        continue;
      }

      // Build prompt and call Ollama
      const prompt = buildPrompt(llmRules, file.diff);
      console.log(`\n📝 Reviewing ${file.filePath}...`);

      try {
        const raw = await generate(prompt, config.model, {
          timeoutMs: (config.ollama_timeout || 20) * 1000,
        });
        const result = parseResponse(raw);

        // Cache the result
        cache.set(file.filePath, file.diff, result);

        if (result.status === 'infrastructure_error') {
          console.log(`⚠️  Guardrails: review returned malformed response for ${file.filePath} — skipping`);
          continue;
        }

        if (result.status === 'fail') {
          allViolations.push(
            ...result.violations.map(v => ({
              rule: v.rule,
              reason: v.reason,
              type: 'llm',
              file: file.filePath,
            }))
          );
        }
      } catch (e) {
        // Timeout or Ollama error — fail open
        console.log(`⚠️  Guardrails: ${e.message} — skipping ${file.filePath}`);
        continue;
      }
    }
  }

  cache.save();

  // 8. Report
  if (allViolations.length > 0) {
    console.log(formatViolations(allViolations));

    try {
      await telemetry.send({
        commit_hash: sessionId,
        author,
        timestamp: new Date().toISOString(),
        result: 'fail',
        files: allViolations.map(v => ({
          file_name: v.file,
          rule_ids: [v.rule],
        })),
      });
    } catch { /* non-blocking */ }

    return 1; // block commit
  }

  console.log('\n✅ Guardrails: all checks passed\n');

  // 9. Record this reviewed commit in the local DB.
  try {
    const { writeFileSync, mkdirSync, existsSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { homedir } = await import('node:os');
    const markerPath = join(homedir(), '.guardrails', 'pending-session');
    const dir = dirname(markerPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(markerPath, sessionId);
  } catch { /* non-blocking */ }

  try {
    await telemetry.send({
      commit_hash: sessionId,
      author,
      timestamp: new Date().toISOString(),
      result: 'pass',
      files: files.map(f => ({ file_name: f.filePath, rule_ids: [] })),
    });
  } catch { /* non-blocking */ }

  return 0; // allow commit
}

function getAuthor() {
  try {
    return execSync('git config user.email', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export { formatViolations };
