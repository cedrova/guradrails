import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { totalmem } from 'node:os';
import { checkOllamaHealth, pullModel } from '../core/ollama-client.js';
import { benchmark as runBenchmark } from './benchmark.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ALL_MODELS = [
  { name: 'qwen2.5-coder:1.5b', sizeGB: 1.0, label: 'Recommended' },
  { name: 'qwen2.5-coder:3b', sizeGB: 1.9, label: 'More thorough' },
  { name: 'deepseek-coder:1.3b', sizeGB: 0.8, label: 'Fastest' },
];

const TEMPLATES = [
  { name: 'node', file: 'node.guardrails.md', label: 'Node.js' },
  { name: 'react', file: 'react.guardrails.md', label: 'React' },
  { name: 'python', file: 'python.guardrails.md', label: 'Python' },
  { name: 'go', file: 'go.guardrails.md', label: 'Go' },
  { name: 'generic', file: 'generic.guardrails.md', label: 'Generic (language-agnostic)' },
];

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function init() {
  console.log('\n🛡️  Guardrails Init\n');

  // 1. Check for existing rule file
  if (existsSync('.guardrails.md')) {
    const overwrite = await prompt('.guardrails.md already exists. Overwrite? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('Aborted.');
      return;
    }
  }

  // 2. Template selection
  console.log('Select a template:\n');
  TEMPLATES.forEach((t, i) => console.log(`  [${i + 1}] ${t.label}`));
  const templateChoice = await prompt(`\nTemplate [1]: `);
  const templateIndex = parseInt(templateChoice || '1', 10) - 1;
  const template = TEMPLATES[templateIndex] || TEMPLATES[0];

  const templatesDir = join(__dirname, '..', '..', 'templates');
  const templatePath = join(templatesDir, template.file);
  let templateContent;
  try {
    templateContent = readFileSync(templatePath, 'utf8');
  } catch {
    console.error(`Template not found: ${templatePath}`);
    process.exit(1);
  }

  // 3. Model selection
  const totalGB = totalmem() / 1e9;
  const safeGB = totalGB * 0.6;
  const availableModels = ALL_MODELS.filter(m => m.sizeGB <= safeGB);

  console.log(`\nAvailable models (your system: ${Math.round(totalGB)} GB RAM):\n`);
  availableModels.forEach((m, i) => {
    console.log(`  [${i + 1}] ${m.name.padEnd(25)} ~${m.sizeGB} GB   ${m.label}`);
  });

  const modelChoice = await prompt(`\nSelect a model [1]: `);
  const modelIndex = parseInt(modelChoice || '1', 10) - 1;
  const model = availableModels[modelIndex] || availableModels[0];

  // 4. Pull model if Ollama is running
  const health = await checkOllamaHealth();
  if (health.ok) {
    console.log(`\nPulling ${model.name}...`);
    try {
      await pullModel(model.name);
      console.log('Done.\n');

      // 5. Run benchmark
      console.log('Running benchmark on your hardware (3 runs, sample diff)...\n');
      await runBenchmark();
    } catch (e) {
      console.warn(`Could not pull model: ${e.message}`);
      console.warn(`Run manually: ollama pull ${model.name}`);
    }
  } else {
    console.warn('\nOllama is not running. Start it with: ollama serve');
    console.warn(`Then run: ollama pull ${model.name}`);
  }

  // 6. Write .guardrails.md with model config prepended
  const configHeader = `model: ${model.name}\n\n`;
  writeFileSync('.guardrails.md', configHeader + templateContent);
  console.log(`\n✓ Writing model: ${model.name} to .guardrails.md`);
  console.log(`✓ Template: ${template.label}`);
  console.log('\nRun "guardrails install" to set up the pre-commit hook.');
}
