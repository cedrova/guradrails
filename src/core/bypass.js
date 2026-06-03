import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Get the last N commits from git log.
 * Returns [{ hash, author, timestamp }].
 */
export function getRecentCommits(count = 10) {
  try {
    const output = execSync(
      `git log --format="%H|%ae|%aI" -n ${count}`,
      { encoding: 'utf8' }
    ).trim();

    if (!output) return [];

    return output.split('\n').map(line => {
      const [hash, author, timestamp] = line.split('|');
      return { hash, author, timestamp };
    });
  } catch {
    return [];
  }
}

/**
 * Pure function: find which git commits are not in the known hashes set.
 * These are bypassed commits.
 */
export function findBypassed(gitCommits, knownHashes) {
  const known = new Set(knownHashes);
  return gitCommits.filter(c => !known.has(c.hash));
}

/**
 * Full reconciliation: compare git log against the database,
 * mark any gaps as bypassed.
 *
 * Before comparing, check for a pending-session marker file.
 * If it exists, the most recent commit in git log was reviewed
 * by the previous pipeline run — backfill its real hash into the
 * DB as a reviewed (non-bypassed) commit, then delete the marker.
 */
export async function reconcileBypasses(db, lookbackCount = 10) {
  const gitCommits = getRecentCommits(lookbackCount);
  if (gitCommits.length === 0) return [];

  // Backfill the last reviewed commit's real hash
  _backfillPendingSession(db, gitCommits);

  const knownHashes = db.getKnownHashes(gitCommits.map(c => c.hash));
  const bypassed = findBypassed(gitCommits, knownHashes);

  for (const commit of bypassed) {
    db.markBypassed(commit.hash, commit.author, commit.timestamp);
  }

  return bypassed;
}

/**
 * If a pending-session marker exists, the most recent commit in git log
 * was reviewed by our pipeline. Record its real hash as non-bypassed.
 */
function _backfillPendingSession(db, gitCommits) {
  try {
    const markerPath = join(homedir(), '.guardrails', 'pending-session');
    if (existsSync(markerPath)) {
      // The most recent commit is the one that was just created
      // after our last successful review (exit 0)
      const lastCommit = gitCommits[0];
      if (lastCommit) {
        db.insertCommit(lastCommit.hash, lastCommit.author, lastCommit.timestamp);
      }
      unlinkSync(markerPath);
    }
  } catch {
    // Non-blocking — if marker read fails, worst case is a false bypass
  }
}
