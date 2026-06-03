import { Command } from 'commander';
import { install } from './commands/install.js';
import { doctor } from './commands/doctor.js';
import { benchmark } from './commands/benchmark.js';
import { init } from './commands/init.js';
import { validate } from './commands/validate.js';

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
    .command('benchmark')
    .description('Benchmark installed Ollama models')
    .action(benchmark);

  program
    .command('init')
    .description('Initialize Guardrails in this project')
    .action(init);

  program
    .command('validate')
    .description('Test a rule against sample diffs')
    .option('--rule <text>', 'The rule text to test')
    .action(validate);

  return program;
}

