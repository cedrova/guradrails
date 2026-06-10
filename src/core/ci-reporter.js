import { readFileSync } from 'node:fs';

/**
 * Formats violations as a GitHub-flavoured markdown PR comment.
 * Returns empty string when there are no violations.
 */
export function formatPRComment(violations) {
  if (!violations || violations.length === 0) return '';

  const header = [
    '## 🛡️ Guardrails Review',
    '',
    `Found **${violations.length} violation${violations.length === 1 ? '' : 's'}** in this pull request.`,
    '',
  ].join('\n');

  const tableHeader = [
    '| File | Rule | Type | Details |',
    '|------|------|------|---------|',
  ].join('\n');

  const rows = violations.map(v => {
    const file    = v.file   ? `\`${v.file}\`` : '`unknown`';
    const reason  = v.reason ? v.reason         : '—';
    return `| ${file} | ${v.rule} | ${v.type} | ${reason} |`;
  }).join('\n');

  const footer = '\n---\n*Reviewed by [Guardrails](https://github.com/cedrova/guradrails)*';

  return `${header}${tableHeader}\n${rows}${footer}`;
}

/**
 * Posts a formatted PR comment via the GitHub API.
 * Silently no-ops if not running in GitHub Actions environment.
 */
export async function postPRComment(violations) {
  const { GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_EVENT_PATH } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !GITHUB_EVENT_PATH) return;

  let prNumber;
  try {
    const event = JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8'));
    prNumber = event.pull_request?.number;
  } catch { return; }

  if (!prNumber) return;

  const body = formatPRComment(violations);
  if (!body) return;

  const [owner, repo] = GITHUB_REPOSITORY.split('/');

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body }),
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) {
      process.stderr.write(`[guardrails] Failed to post PR comment: HTTP ${res.status}\n`);
    }
  } catch (e) {
    process.stderr.write(`[guardrails] Failed to post PR comment: ${e.message}\n`);
  }
}
