import { buildPrompt } from '../core/prompt-builder.js';
import { generate } from '../core/ollama-client.js';
import { parseResponse } from '../core/response-parser.js';
import { loadRules } from '../core/rule-loader.js';

const SAMPLE_DIFFS = [
  {
    label: 'Parameterized query (should PASS)',
    diff: "+  db.query('SELECT * FROM users WHERE id = $1', [userId]);",
    expectViolation: false,
  },
  {
    label: 'String concatenation (should FAIL)',
    diff: "+  db.query('SELECT * FROM users WHERE id = ' + userId);",
    expectViolation: true,
  },
  {
    label: 'Template literal (should FAIL)',
    diff: "+  db.query(`SELECT * FROM users WHERE id = ${userId}`);",
    expectViolation: true,
  },
];

export async function validate(options) {
  const ruleText = options.rule;

  if (!ruleText) {
    console.error('Usage: guardrails validate --rule "Your rule text here"');
    process.exit(1);
  }

  // Try to get model from config, fall back to default
  let model = 'qwen2.5-coder:1.5b';
  try {
    const { config } = loadRules(process.cwd());
    model = config.model || model;
  } catch { /* use default */ }

  const rule = { type: 'llm', id: '', text: ruleText };

  console.log(`\nTesting rule against ${SAMPLE_DIFFS.length} sample diffs...\n`);

  let correct = 0;

  for (const sample of SAMPLE_DIFFS) {
    console.log(`  Sample: ${sample.label}`);
    console.log(`    ${sample.diff}`);

    const prompt = buildPrompt([rule], sample.diff);

    try {
      const raw = await generate(prompt, model, { stream: false, timeoutMs: 30000 });
      const result = parseResponse(raw);

      const hasViolation = result.status === 'fail' && result.violations.length > 0;
      const isCorrect = hasViolation === sample.expectViolation;

      console.log(`    Result: ${result.status.toUpperCase()}  (${isCorrect ? 'correct' : 'INCORRECT'})`);

      if (isCorrect) correct++;
    } catch (e) {
      console.log(`    Error: ${e.message}`);
    }

    console.log('');
  }

  console.log(`Rule ${correct === SAMPLE_DIFFS.length ? 'OK' : 'NEEDS TUNING'}. ${correct}/${SAMPLE_DIFFS.length} samples evaluated correctly.`);
}
