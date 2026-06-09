import { listLocalModels, generate } from '../core/ollama-client.js';
import { loadRules } from '../core/rule-loader.js';
import pc from 'picocolors';

const SAMPLE_DIFF = `--- a/src/db/queries.js
+++ b/src/db/queries.js
@@ -12,7 +12,7 @@
+  const result = await db.query('SELECT * FROM users WHERE id = ' + userId);`;

const SAMPLE_PROMPT = `You are a code reviewer. Review this diff.
Rules:
1. Never concatenate SQL strings.

Diff:
${SAMPLE_DIFF}

Return ONLY a JSON object: {"status":"pass"|"fail","violations":[]}`;

const RUNS = 3;

export async function benchmark() {
  const models = await listLocalModels();

  if (models.length === 0) {
    console.log('No models installed. Run: ollama pull qwen2.5-coder:1.5b');
    process.exit(1);
  }

  // Determine current default model
  let currentModel;
  try {
    const { config } = loadRules(process.cwd());
    currentModel = config.model;
  } catch {
    currentModel = null;
  }

  console.log('\n' + pc.bold('Benchmarking installed models (3 runs each)...\n'));
  console.log(
    '  ' + pc.bold('Model'.padEnd(30)) +
    pc.bold('Avg'.padEnd(10)) +
    pc.bold('Min'.padEnd(10)) +
    pc.bold('Max')
  );
  console.log('  ' + '─'.repeat(56));

  const results = [];
  for (const model of models) {
    const times = [];
    for (let i = 0; i < RUNS; i++) {
      const start = performance.now();
      try {
        await generate(SAMPLE_PROMPT, model, {
          timeoutMs: 60000,
          stream: false,
        });
        times.push((performance.now() - start) / 1000);
      } catch {
        times.push(NaN);
      }
    }

    const validTimes = times.filter(t => !isNaN(t));
    if (validTimes.length === 0) {
      console.log(`  ${model.padEnd(30)}FAILED`);
      continue;
    }

    const avg = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
    const min = Math.min(...validTimes);
    const max = Math.max(...validTimes);
    results.push({ model, avg, min, max });
    
    const isCurrent = model === currentModel;
    const modelStr  = isCurrent
      ? pc.green(model.padEnd(30))
      : model.padEnd(30);
    const tag = isCurrent ? pc.green(' ← current') : '';
    console.log(
      `  ${modelStr}${avg.toFixed(1).padEnd(10)}${min.toFixed(1).padEnd(10)}${max.toFixed(1)}s${tag}`
    );
  }

  console.log('');
  const current = results.find(r => r.model === currentModel);
  if (current) {
    console.log(
      `  ${pc.dim(`This means commits with LLM rules will take ~${current.avg.toFixed(0)}s per file on this machine.`)}`
    );
    console.log(`  ${pc.dim(`To change model: update 'model:' in .guardrails.md`)}\n`);
  }
}

export { SAMPLE_PROMPT, SAMPLE_DIFF };
