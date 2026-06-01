import { execSync } from 'node:child_process';

const WARN_THRESHOLD = 1500;
const SPLIT_THRESHOLD = 3000;

/**
 * Estimate token count from text using chars/4 heuristic.
 * Fast, no tokenizer dependency, accurate enough for threshold decisions.
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Returns a warning object if token count exceeds thresholds, or null.
 */
export function getDiffWarning(tokenCount) {
  if (tokenCount >= SPLIT_THRESHOLD) {
    return {
      level: 'split',
      message: `Diff is ~${tokenCount} tokens (>${SPLIT_THRESHOLD}). Splitting by file for independent review.`,
    };
  }
  if (tokenCount >= WARN_THRESHOLD) {
    return {
      level: 'warn',
      message: `Diff is ~${tokenCount} tokens (>${WARN_THRESHOLD}). Review may take longer than usual.`,
    };
  }
  return null;
}

/**
 * Split a unified diff string into per-file entries.
 * Each entry has { filePath, diff }.
 */
export function splitDiffByFile(diffText) {
  if (!diffText || !diffText.trim()) return [];

  const files = [];
  const lines = diffText.split('\n');
  let currentFile = null;
  let currentLines = [];

  for (const line of lines) {
    const match = line.match(/^diff --git a\/.+ b\/(.+)$/);
    if (match) {
      if (currentFile) {
        files.push({ filePath: currentFile, diff: currentLines.join('\n') });
      }
      currentFile = match[1];
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  if (currentFile) {
    files.push({ filePath: currentFile, diff: currentLines.join('\n') });
  }

  return files;
}

/**
 * Get the staged diff from git (git diff --cached).
 * Returns the raw diff string.
 */
export function getStagedDiff() {
  try {
    return execSync('git diff --cached', { encoding: 'utf8' });
  } catch (e) {
    throw new Error(`Failed to get staged diff: ${e.message}`);
  }
}

export { WARN_THRESHOLD, SPLIT_THRESHOLD };
