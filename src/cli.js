import { Command } from 'commander';

export function createCLI() {
  const program = new Command();
  program
    .name('guardrails')
    .description('Local-first code review via git pre-commit hooks')
    .version('1.0.0');

  // Commands will be registered in later tasks
  return program;
}
