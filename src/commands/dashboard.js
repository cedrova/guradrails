import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import pc from 'picocolors';

export async function dashboard(options = {}) {
  const localDbPath = join(homedir(), '.guardrails', 'history.db');
  const port        = options.port || 3000;

  console.log('\n🛡️  Guardrails Dashboard\n');

  if (!existsSync(localDbPath)) {
    console.log(
      `${pc.yellow('⚠')}  No local history database found at ${localDbPath}\n` +
      `    Run ${pc.cyan('guardrails install')} first to create it, then make some commits.\n`
    );
  }

  console.log(`  Local database: ${pc.dim(localDbPath)}`);
  console.log(`  Starting server on port ${port}...\n`);

  const { createServer } = await import('../dashboard/server.js');

  const server = await createServer({
    dbPath:    localDbPath,
    localMode: true,   // auto-authenticate /dashboard, no key required
    port,
  });

  const addr = server.address();
  const base = `http://localhost:${addr.port}`;

  console.log(`  ${pc.bold('Demo:')}      ${pc.cyan(base + '/demo')}        ${pc.dim('(public — shareable)')}`);
  console.log(`  ${pc.bold('Dashboard:')} ${pc.cyan(base + '/dashboard')}   ${pc.dim('(auto-authenticated locally)')}`);
  console.log(`\n  Press ${pc.bold('Ctrl+C')} to stop.\n`);

  // Keep the process alive until Ctrl+C
  await new Promise(resolve => {
    process.on('SIGINT', () => {
      console.log('\n  Stopped.\n');
      server.close(resolve);
    });
  });
}
