import { execSync } from 'node:child_process';

/**
 * Returns the last N commits from git log.
 * Each entry includes the commit's parent hash — used as a watermark
 * for bypass detection. parentHash is null for the initial commit.
 */
export function getRecentCommits(count = 10) {
  try {
    const out = execSync(
      `git log --format="%H|%P|%ae|%aI" -n ${count}`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    if (!out) return [];
    return out.split('\n').map(line => {
      const [hash, parents, author, timestamp] = line.split('|');
      // %P returns all parent hashes space-separated; take the first for linear history
      const parentHash = parents?.trim().split(' ')[0] || null;
      return {
        hash:       hash.trim(),
        parentHash: parentHash || null,
        author:     author.trim(),
        timestamp:  timestamp.trim(),
      };
    });
  } catch {
    return [];
  }
}

/**
 * Pure function: given an array of commits and the set of known parent hashes
 * (from history.db sessions), return commits that were never reviewed.
 *
 * A commit C is bypassed when its parentHash is NOT in knownParentHashes.
 * This works because a session records prev_hash = HEAD at review time,
 * which equals the parent of the commit that was staged.
 */
export function findBypassed(gitCommits, knownParentHashes) {
  const known = new Set(knownParentHashes);
  return gitCommits.filter(c =>
    c.parentHash !== null &&        // skip initial commit (no parent)
    !known.has(c.parentHash)        // no session recorded this as its prev_hash
  );
}

/**
 * Reconciles bypass state: compares recent git log against history.db sessions.
 * Any commit whose parent hash is not recorded as a session's prev_hash is bypassed.
 *
 * Returns early with [] if no sessions exist yet (first install — nothing is bypassed).
 * Called at the START of every pipeline run before diff extraction.
 */
export async function reconcileBypasses(db, lookbackCount = 10) {
  const sessions = db.getAllSessions();
  if (sessions.length === 0) return []; // first use — no history yet, nothing is bypassed

  const gitCommits = getRecentCommits(lookbackCount);
  if (gitCommits.length === 0) return [];

  const knownParentHashes = db.getKnownParentHashes();
  const bypassed = findBypassed(gitCommits, knownParentHashes);

  for (const commit of bypassed) {
    db.markBypassed(commit.hash, commit.author, commit.timestamp);
  }

  return bypassed;
}
