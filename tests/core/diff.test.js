import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens, splitDiffByFile, getDiffWarning } from '../../src/core/diff.js';

describe('estimateTokens', () => {
  it('returns chars / 4 rounded up', () => {
    assert.equal(estimateTokens('a'.repeat(100)), 25);
    assert.equal(estimateTokens('a'.repeat(101)), 26);
    assert.equal(estimateTokens(''), 0);
  });
});

describe('getDiffWarning', () => {
  it('returns null below warn threshold', () => {
    assert.equal(getDiffWarning(1499), null);
  });
  it('returns warn between 1500 and 2999', () => {
    const w = getDiffWarning(1500);
    assert.ok(w);
    assert.equal(w.level, 'warn');
  });
  it('returns split at 3000+', () => {
    const w = getDiffWarning(3000);
    assert.ok(w);
    assert.equal(w.level, 'split');
  });
});

describe('splitDiffByFile', () => {
  it('splits a multi-file diff into per-file entries', () => {
    const diff = [
      'diff --git a/foo.js b/foo.js',
      '--- a/foo.js',
      '+++ b/foo.js',
      '@@ -1,3 +1,3 @@',
      '+console.log("foo");',
      'diff --git a/bar.js b/bar.js',
      '--- a/bar.js',
      '+++ b/bar.js',
      '@@ -1,2 +1,2 @@',
      '+console.log("bar");',
    ].join('\n');

    const files = splitDiffByFile(diff);
    assert.equal(files.length, 2);
    assert.equal(files[0].filePath, 'foo.js');
    assert.equal(files[1].filePath, 'bar.js');
    assert.ok(files[0].diff.includes('console.log("foo")'));
    assert.ok(files[1].diff.includes('console.log("bar")'));
  });

  it('returns empty array for empty diff', () => {
    assert.deepEqual(splitDiffByFile(''), []);
  });
});
