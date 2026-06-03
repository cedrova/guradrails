import { execSync } from 'node:child_process';
import { checkOllamaHealth, listLocalModels } from '../core/ollama-client.js';
import { loadRules } from '../core/rule-loader.js';

export function formatCheckResult({ ok, label, detail, fix }) {
  const icon = ok ? '[OK]  ' : '[FAIL]';
  let line = `  ${icon} ${label}`;
  if (detail) line += `        (${detail})`;
  if (!ok && fix) line += `\n           Fix: ${fix}`;
  return line;
}

export async function doctor() {
  console.log('\nChecking Guardrails environment...\n');

  const checks = [];

  // 1. Ollama binary installed
  let ollamaInstalled = false;
  try {
    const version = execSync('ollama --version', { encoding: 'utf8' }).trim();
    checks.push({ ok: true, label: 'Ollama installed', detail: version });
    ollamaInstalled = true;
  } catch {
    checks.push({
      ok: false,
      label: 'Ollama not installed',
      detail: null,
      fix: 'Install Ollama from https://ollama.com, then run guardrails doctor',
    });
  }

  // 2. Ollama running
  let ollamaRunning = false;
  if (ollamaInstalled) {
    const health = await checkOllamaHealth();
    if (health.ok) {
      checks.push({ ok: true, label: 'Ollama running', detail: `localhost:11434` });
      ollamaRunning = true;
    } else {
      checks.push({
        ok: false,
        label: 'Ollama not running',
        detail: health.error,
        fix: 'Start Ollama with: ollama serve',
      });
    }
  }

  // 3. Model available
  let modelName = 'qwen2.5-coder:1.5b';
  try {
    const { config } = loadRules(process.cwd());
    modelName = config.model || modelName;
  } catch { /* use default */ }

  if (ollamaRunning) {
    const models = await listLocalModels();
    const found = models.some(m => m.startsWith(modelName));
    if (found) {
      checks.push({ ok: true, label: 'Model found', detail: modelName });
    } else {
      checks.push({
        ok: false,
        label: 'Model not found',
        detail: modelName,
        fix: `ollama pull ${modelName}`,
      });
    }
  }

  // 4. .guardrails.md found
  try {
    const { rules, filePath } = loadRules(process.cwd());
    const staticCount = rules.filter(r => r.type === 'static').length;
    const llmCount = rules.filter(r => r.type === 'llm').length;
    checks.push({
      ok: true,
      label: '.guardrails.md found',
      detail: `${staticCount} static rules, ${llmCount} LLM rules`,
    });
  } catch {
    checks.push({
      ok: false,
      label: '.guardrails.md not found',
      detail: null,
      fix: 'Run: guardrails init',
    });
  }

  // Print results
  for (const check of checks) {
    console.log(formatCheckResult(check));
  }

  const failures = checks.filter(c => !c.ok);
  console.log('');
  if (failures.length === 0) {
    console.log('All checks passed. Guardrails is ready.');
  } else {
    console.log(`${failures.length} check(s) failed. Fix the issues above and run 'guardrails doctor' again.`);
    process.exitCode = 1;
  }
}
