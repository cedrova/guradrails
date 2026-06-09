import { createLLMClient }  from '../core/llm-client.js';
import { loadRules }        from '../core/rule-loader.js';
import { statusLine }       from '../core/ui.js';
import pc                   from 'picocolors';

export async function doctor() {
  console.log('\n🛡️  Guardrails Doctor\n');

  let config = {};
  let rules  = [];
  let configOk = false;

  try {
    const loaded = loadRules(process.cwd());
    config   = loaded.config;
    rules    = loaded.rules;
    configOk = true;
  } catch { /* config missing — handled below */ }

  const provider = config.llm_provider || 'ollama';
  const lines = [];
  let hasFailure = false;
  let hasWarning = false;

  console.log(`  Provider: ${pc.cyan(provider)}\n`);

  // ── Provider-specific checks ───────────────────────────────────────────────
  if (provider === 'ollama') {
    // Check Ollama installed
    const installed = await checkOllamaInstalled();
    lines.push(statusLine(installed.ok ? 'ok' : 'fail', 'Ollama installed',
      installed.version || installed.error));
    if (!installed.ok) { hasFailure = true; goto_summary(lines, hasFailure, hasWarning); return; }

    // Check Ollama running
    const running = await checkOllamaRunning();
    lines.push(statusLine(running.ok ? 'ok' : 'fail', 'Ollama running',
      running.ok ? 'localhost:11434' : running.error));
    if (!running.ok) { hasFailure = true; goto_summary(lines, hasFailure, hasWarning); return; }

    // Check model available
    const model = config.model || 'qwen2.5-coder:1.5b';
    const modelOk = await checkModelAvailable(model);
    lines.push(statusLine(modelOk ? 'ok' : 'fail', `Model available`,
      modelOk ? model : `'${model}' not found — run: ollama pull ${model}`));
    if (!modelOk) hasFailure = true;

  } else if (provider === 'openai') {
    const keySet = !!process.env.OPENAI_API_KEY;
    lines.push(statusLine(keySet ? 'ok' : 'fail', 'OPENAI_API_KEY set',
      keySet ? 'sk-...redacted' : 'not set — add to shell environment'));
    if (!keySet) hasFailure = true;
    lines.push(statusLine('warn', 'Ollama not checked', `llm_provider is '${provider}', not 'ollama'`));
    hasWarning = true;

  } else if (provider === 'anthropic') {
    const keySet = !!process.env.ANTHROPIC_API_KEY;
    lines.push(statusLine(keySet ? 'ok' : 'fail', 'ANTHROPIC_API_KEY set',
      keySet ? 'sk-ant-...redacted' : 'not set — add to shell environment'));
    if (!keySet) hasFailure = true;
    lines.push(statusLine('warn', 'Ollama not checked', `llm_provider is '${provider}', not 'ollama'`));
    hasWarning = true;
  }

  // ── Config checks ─────────────────────────────────────────────────────────
  lines.push(statusLine(configOk ? 'ok' : 'fail', '.guardrails.md found',
    configOk ? 'repo root' : 'not found — run: guardrails init'));
  if (!configOk) hasFailure = true;

  if (configOk) {
    const staticCount = rules.filter(r => r.type === 'static').length;
    const llmCount    = rules.filter(r => r.type === 'llm').length;
    lines.push(statusLine('ok', 'Rules loaded', `${staticCount} static, ${llmCount} LLM`));
  }

  goto_summary(lines, hasFailure, hasWarning);

  // Cloud LLM privacy notice
  if (provider === 'openai' || provider === 'anthropic') {
    console.log(
      `\n${pc.yellow('⚠')}  Cloud LLM selected. Your code diffs will be sent to ${
        provider === 'openai' ? 'OpenAI' : 'Anthropic'
      } for review.`
    );
    console.log(`    If this is sensitive code, switch to llm_provider: ollama for full privacy.\n`);
  }
}

function goto_summary(lines, hasFailure, hasWarning) {
  for (const l of lines) console.log(l);
  console.log('');
  if (hasFailure) {
    console.log(`  ${pc.red('✗')} One or more checks failed. Fix the issues above.\n`);
  } else if (hasWarning) {
    console.log(`  ${pc.yellow('⚠')} All checks passed (with warnings).\n`);
  } else {
    console.log(`  ${pc.green('✓')} All checks passed.\n`);
  }
}

async function checkOllamaInstalled() {
  try {
    const { execSync } = await import('node:child_process');
    const out = execSync('ollama --version', { encoding: 'utf8' }).trim();
    return { ok: true, version: out.split('\n')[0] };
  } catch {
    return { ok: false, error: 'not installed — install from ollama.com' };
  }
}

async function checkOllamaRunning() {
  try {
    const res = await fetch('http://localhost:11434/api/tags',
      { signal: AbortSignal.timeout(3000) });
    return { ok: res.ok };
  } catch {
    return { ok: false, error: 'not running — start with: ollama serve' };
  }
}

async function checkModelAvailable(model) {
  try {
    const { listLocalModels } = await import('../core/ollama-client.js');
    const models = await listLocalModels();
    return models.some(m => m === model || m.startsWith(model + ':'));
  } catch { return false; }
}
