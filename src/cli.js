import { Command } from 'commander';
import { install } from './commands/install.js';
import { doctor } from './commands/doctor.js';
import { init } from './commands/init.js';
import { validate } from './commands/validate.js';
import { benchmark } from './commands/benchmark.js';
import { dashboard } from './commands/dashboard.js';
import { runPipeline } from './core/pipeline.js';

export function createCLI() {
  const program = new Command();
  program
    .name('guardrails')
    .description('Local-first code review via git pre-commit hooks')
    .version('1.0.0');

  program
    .command('install')
    .description('Install the Guardrails pre-commit hook')
    .action(install);

  program
    .command('doctor')
    .description('Check your Guardrails environment')
    .action(doctor);

  program
    .command('init')
    .description('Initialize Guardrails in this project')
    .action(init);

  program
    .command('validate')
    .description('Test a rule against sample diffs')
    .option('--rule <text>', 'The rule text to test')
    .action(validate);

  program
    .command('benchmark')
    .description('Benchmark installed Ollama models')
    .action(benchmark);

  program
    .command('review')
    .description('Run the pre-commit review (called by the git hook)')
    .option('--ci', 'CI mode: diff from git, post PR comment on violations')
    .action(async (options) => {
      const exitCode = await runPipeline({ ci: !!options.ci });
      process.exit(exitCode);
    });

  program
    .command('dashboard')
    .description('Start the local dashboard server and view your commit history')
    .option('-p, --port <number>', 'Port to listen on', '3000')
    .action((options) => dashboard({ port: parseInt(options.port, 10) }));

  return program;
}
