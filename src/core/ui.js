import pc from 'picocolors';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function createSpinner(label) {
  let frame = 0;
  let interval = null;

  const spin = () => {
    process.stdout.write(`\r${pc.cyan(FRAMES[frame % FRAMES.length])} ${label}`);
    frame++;
  };

  const start = () => {
    interval = setInterval(spin, 80);
    return spinner;
  };

  const succeed = (msg) => {
    clearInterval(interval);
    process.stdout.write(`\r${pc.green('✓')} ${msg}\n`);
  };

  const fail = (msg) => {
    clearInterval(interval);
    process.stdout.write(`\r${pc.red('✗')} ${msg}\n`);
  };

  const warn = (msg) => {
    clearInterval(interval);
    process.stdout.write(`\r${pc.yellow('⚠')} ${msg}\n`);
  };

  const spinner = { start, succeed, fail, warn };
  return spinner;
}

export function formatViolationTable(violations) {
  const lines = [
    '',
    pc.red('🚫 Guardrails: commit blocked'),
    '',
  ];

  for (const v of violations) {
    const tag = v.type === 'static'
      ? pc.blue('[static]')
      : pc.magenta('[llm]  ');
    lines.push(`  ${tag} ${pc.bold(v.rule)}`);
    if (v.reason) {
      lines.push(`           ${pc.dim(v.reason)}`);
    }
  }

  lines.push('');
  lines.push(
    `  ${pc.red(`${violations.length} violation(s) found.`)} Fix the issues above and try again.`
  );
  lines.push('');
  return lines.join('\n');
}

export function statusLine(status, label, detail = '') {
  const icon =
    status === 'ok'   ? pc.green('[OK]')   :
    status === 'fail' ? pc.red('[FAIL]')   :
                        pc.yellow('[WARN]');
  const detailStr = detail ? pc.dim(`  (${detail})`) : '';
  return `  ${icon.padEnd(18)} ${label}${detailStr}`;
}
