import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { totalmem } from 'node:os';
import { checkOllamaHealth, pullModel } from '../core/ollama-client.js';
import { benchmark as runBenchmark } from './benchmark.js';
import pc from 'picocolors';
import { createSpinner } from '../core/ui.js';

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

  console.log('Select LLM provider:\n');
  console.log('  [1] ollama     Local AI — code stays on your machine  (Recommended)');
  console.log('  [2] openai     Cloud — faster, requires OPENAI_API_KEY');
  console.log('  [3] anthropic  Cloud — faster, requires ANTHROPIC_API_KEY');
  console.log('');

  const providerChoice = await prompt('Provider [1]: ');
  const providerMap = { '1': 'ollama', '2': 'openai', '3': 'anthropic' };
  const provider = providerMap[providerChoice.trim()] || 'ollama';

  // ── Privacy warning for cloud providers ────────────────────────────────────
  if (provider === 'openai' || provider === 'anthropic') {
    const providerName = provider === 'openai' ? 'OpenAI' : 'Anthropic';
    console.log(`\n${pc.yellow('⚠')}  Cloud provider selected. Your code diffs will be sent to ${providerName}.`);
    console.log(`    OpenAI/Anthropic's data usage policy applies to all submitted content.`);
    console.log(`    If this code is proprietary, use llm_provider: ollama instead.\n`);
    const confirm = await prompt('Continue? (y/N): ');
    if (confirm.trim().toLowerCase() !== 'y') {
      console.log('Aborted.');
      return;
    }
  }

  // 1. Check for existing rule file
  if (existsSync('.guardrails.md')) {
    const overwrite = await prompt('.guardrails.md already exists. Overwrite? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('Aborted.');
      return;
    }
  }

  // 2. Template selection
  console.log('\nSelect a template:\n');
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
  let model;
  if (provider === 'openai') {
    console.log('\nSelect model:\n');
    console.log('  [1] gpt-4o-mini   Recommended — fast, cheap, good accuracy');
    console.log('  [2] gpt-4o        Slower, expensive, highest accuracy\n');
    const modelChoice = await prompt('Model [1]: ');
    model = modelChoice.trim() === '2' ? 'gpt-4o' : 'gpt-4o-mini';

    // Check API key
    if (!process.env.OPENAI_API_KEY) {
      console.log(`\n${pc.yellow('⚠')}  OPENAI_API_KEY not found in environment.`);
      console.log(`    Add it to your shell: export OPENAI_API_KEY=sk-...\n`);
    } else {
      console.log(`${pc.green('✓')} OPENAI_API_KEY found\n`);
    }

  } else if (provider === 'anthropic') {
    console.log('\nSelect model:\n');
    console.log('  [1] claude-haiku-4-5     Recommended — fast, low cost');
    console.log('  [2] claude-sonnet-4-6    Slower, highest accuracy\n');
    const modelChoice = await prompt('Model [1]: ');
    model = modelChoice.trim() === '2' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5';

    if (!process.env.ANTHROPIC_API_KEY) {
      console.log(`\n${pc.yellow('⚠')}  ANTHROPIC_API_KEY not found in environment.`);
      console.log(`    Add it to your shell: export ANTHROPIC_API_KEY=sk-ant-...\n`);
    } else {
      console.log(`${pc.green('✓')} ANTHROPIC_API_KEY found\n`);
    }

  } else {
    // Ollama selection
    const totalGB = totalmem() / 1e9;
    const safeGB = totalGB * 0.6;
    const availableModels = ALL_MODELS.filter(m => m.sizeGB <= safeGB);

    console.log(`\nAvailable models (your system: ${Math.round(totalGB)} GB RAM):\n`);
    availableModels.forEach((m, i) => {
      console.log(`  [${i + 1}] ${m.name.padEnd(25)} ~${m.sizeGB} GB   ${m.label}`);
    });

    const modelChoice = await prompt(`\nSelect a model [1]: `);
    const modelIndex = parseInt(modelChoice || '1', 10) - 1;
    const modelObj = availableModels[modelIndex] || availableModels[0];
    model = modelObj.name;

    // 4. Pull model if Ollama is running
    const health = await checkOllamaHealth();
    if (health.ok) {
      console.log(`\nPulling ${model}...`);
      try {
        await pullModel(model);
        console.log('Done.\n');

        // 5. Run benchmark
        console.log('Running benchmark on your hardware (3 runs, sample diff)...\n');
        await runBenchmark();
      } catch (e) {
        console.warn(`Could not pull model: ${e.message}`);
        console.warn(`Run manually: ollama pull ${model}`);
      }
    } else {
      console.warn('\nOllama is not running. Start it with: ollama serve');
      console.warn(`Then run: ollama pull ${model}`);
    }
  }

  // 6. Write .guardrails.md with model config prepended
  const configBlock = [
    '## Config',
    `model: ${model}`,
    `llm_provider: ${provider}`,
    '',
  ].join('\n');
  writeFileSync('.guardrails.md', configBlock + '\n' + templateContent);
  console.log(`\n✓ Writing model: ${model} to .guardrails.md`);
  console.log(`✓ Template: ${template.label}`);
  console.log('\nRun "guardrails install" to set up the pre-commit hook.');
}
