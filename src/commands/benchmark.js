import { listLocalModels, generate } from '../core/ollama-client.js';
import { loadRules } from '../core/rule-loader.js';

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

  console.log(`\nBenchmarking installed models (${RUNS} runs each, same sample diff)...\n`);
  console.log('Model                      Avg      Min      Max');
  console.log('---------------------------------------------------');

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
      console.log(`${model.padEnd(27)}FAILED`);
      continue;
    }

    const avg = (validTimes.reduce((a, b) => a + b, 0) / validTimes.length).toFixed(1);
    const min = Math.min(...validTimes).toFixed(1);
    const max = Math.max(...validTimes).toFixed(1);
    const marker = model === currentModel ? '  <- current default' : '';

    console.log(`${model.padEnd(27)}${avg}s    ${min}s    ${max}s${marker}`);
  }

  console.log(`\nThis means commits with LLM rules will take ~avg per file on this machine.`);
  console.log("To change model: update 'model:' in .guardrails.md");
}

export { SAMPLE_PROMPT, SAMPLE_DIFF };
