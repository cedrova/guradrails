# Guardrails — Implementation Plan

> Local-first, privacy-preserving code review via git pre-commit hooks.  
> Source spec: [specv3.md](file:///c:/warlock/guardrails/specv3.md)

---

## Scope

This plan covers the **full v1** of Guardrails as defined in specv3.md:

| Subsystem | What it does |
|-----------|-------------|
| **Core modules** | diff extraction, rule loading, static checks, prompt building, Ollama client, response parsing, caching, telemetry, bypass detection |
| **CLI commands** | `doctor`, `install`, `init`, `validate`, `benchmark` |
| **Pipeline orchestrator** | The pre-commit hook flow that wires all core modules together |
| **Dashboard** | Express + SQLite single-tenant dashboard with demo page, protected dashboard, and REST API |
| **Templates** | Pre-written `.guardrails.md` files for Node, React, Python, Go, and generic stacks |

## User Review Required

> [!IMPORTANT]
> **Test framework choice:** This plan uses Node's built-in `node:test` runner (available in Node 18+, which the spec already requires). This avoids a vitest/jest dependency. If you prefer vitest or jest, let me know before I start.

> [!IMPORTANT]
> **Module system:** The plan uses **ESM** (`"type": "module"` in package.json). All imports use `import`/`export` syntax. Confirm this is acceptable vs CommonJS.

> [!WARNING]
> **Dashboard HTML/CSS:** The spec describes a demo page and a protected dashboard but provides no UI design details. I'll build functional pages with clean, modern styling. The dashboard is a secondary deliverable — the CLI pipeline is the core product.

## Open Questions

> [!IMPORTANT]
> **1. Where should the project root live?** The plan assumes `c:\warlock\guardrails\` as the project root (alongside the existing spec files). Confirm or provide a different path.

> [!IMPORTANT]
> **2. npm package name:** The plan uses `guardrails-cli` as the npm package name to avoid collisions with existing `guardrails` packages. Acceptable?

> [!IMPORTANT]  
> **3. `no-banned-import` config syntax:** The spec mentions `banned:` config in `.guardrails.md` but doesn't define the exact YAML shape. I'll implement it as `banned_imports: ["lodash", "moment"]` — a top-level array in the config section. Confirm.

---

## File Structure

```
c:\warlock\guardrails\
  package.json
  bin/
    guardrails.js                # CLI entry point (hashbang + commander)
  src/
    cli.js                       # Commander setup, routes to command handlers
    commands/
      doctor.js                  # Environment health checks
      install.js                 # Git hook installer
      init.js                    # Project scaffolding + model selection
      validate.js                # Rule testing against sample diffs
      benchmark.js               # Model speed benchmarking
    core/
      diff.js                    # Diff extraction + token estimation
      rule-loader.js             # Rule file resolution + static/LLM split
      static-runner.js           # Deterministic rule execution
      prompt-builder.js          # LLM prompt construction
      ollama-client.js           # Ollama HTTP client + timeout + streaming
      response-parser.js         # JSON validation + violation extraction
      cache.js                   # Diff hash -> result caching
      telemetry.js               # Telemetry interface + adapters
      bypass.js                  # Bypass reconciliation
      local-db.js                # Local SQLite DB at ~/.guardrails/local.db
      pipeline.js                # Main pre-commit pipeline orchestrator
  src/
    dashboard/
      server.js                  # Express API server
      db.js                      # SQLite adapter (better-sqlite3)
      routes/
        api.js                   # REST endpoints for CLI posting
        pages.js                 # Serve demo + dashboard HTML
      public/
        demo.html                # Public demo page with seeded data
        dashboard.html           # Secret-key protected dashboard
  templates/
    node.guardrails.md
    react.guardrails.md
    python.guardrails.md
    go.guardrails.md
    generic.guardrails.md
  tests/
    core/
      diff.test.js
      rule-loader.test.js
      static-runner.test.js
      prompt-builder.test.js
      response-parser.test.js
      cache.test.js
      bypass.test.js
      local-db.test.js
    commands/
      doctor.test.js
      install.test.js
    integration/
      pipeline.test.js
    dashboard/
      db.test.js
      api.test.js
  Dockerfile
  docker-compose.yml
```

---

## Phase 1: Project Scaffolding

### Task 1.1: Initialize the project

**Files:**
- Create: `package.json`
- Create: `bin/guardrails.js`
- Create: `src/cli.js`

- [ ] **Step 1: Create package.json**
  ```json
  {
    "name": "guardrails-cli",
    "version": "1.0.0",
    "description": "Local-first, privacy-preserving code review via git pre-commit hooks",
    "type": "module",
    "bin": {
      "guardrails": "./bin/guardrails.js"
    },
    "scripts": {
      "test": "node --test tests/**/*.test.js",
      "test:core": "node --test tests/core/*.test.js",
      "test:commands": "node --test tests/commands/*.test.js",
      "test:dashboard": "node --test tests/dashboard/*.test.js",
      "dashboard": "node src/dashboard/server.js"
    },
    "engines": {
      "node": ">=18.0.0"
    },
    "dependencies": {
      "commander": "^12.0.0",
      "better-sqlite3": "^11.0.0",
      "express": "^4.21.0",
      "uuid": "^10.0.0"
    },
    "devDependencies": {}
  }
  ```

- [ ] **Step 2: Create the CLI entry point**

  `bin/guardrails.js`:
  ```javascript
  #!/usr/bin/env node
  import { createCLI } from '../src/cli.js';

  const program = createCLI();
  program.parse(process.argv);
  ```

  `src/cli.js`:
  ```javascript
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
  ```

- [ ] **Step 3: Install dependencies**
  Run: `cd c:\warlock\guardrails && npm install`
  Expected: `node_modules` created, `package-lock.json` generated.

- [ ] **Step 4: Verify CLI boots**
  Run: `node bin/guardrails.js --help`
  Expected: Help text with "Local-first code review via git pre-commit hooks"

- [ ] **Step 5: Commit**
  ```bash
  git add package.json package-lock.json bin/ src/cli.js
  git commit -m "feat: project scaffolding with CLI entry point"
  ```

---

## Phase 2: Core Modules

Dependencies flow bottom-up: modules with zero imports are built first.

---

### Task 2.1: Diff Extractor — `src/core/diff.js`

**Files:**
- Create: `src/core/diff.js`
- Create: `tests/core/diff.test.js`

- [ ] **Step 1: Write the failing tests**

  `tests/core/diff.test.js`:
  ```javascript
  import { describe, it } from 'node:test';
  import assert from 'node:assert/strict';
  import { estimateTokens, splitDiffByFile, getDiffWarning } from '../src/core/diff.js';

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
  ```

- [ ] **Step 2: Run tests to verify they fail**
  Run: `node --test tests/core/diff.test.js`
  Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

  `src/core/diff.js`:
  ```javascript
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
  ```

- [ ] **Step 4: Run tests to verify they pass**
  Run: `node --test tests/core/diff.test.js`
  Expected: All 6 tests PASS

- [ ] **Step 5: Commit**
  ```bash
  git add src/core/diff.js tests/core/diff.test.js
  git commit -m "feat: diff extractor with token estimation and file splitting"
  ```

---

### Task 2.2: Rule Loader — `src/core/rule-loader.js`

**Files:**
- Create: `src/core/rule-loader.js`
- Create: `tests/core/rule-loader.test.js`

- [ ] **Step 1: Write the failing tests**

  `tests/core/rule-loader.test.js`:
  ```javascript
  import { describe, it } from 'node:test';
  import assert from 'node:assert/strict';
  import { parseRuleLine, parseRuleFile, loadConfig } from '../src/core/rule-loader.js';

  describe('parseRuleLine', () => {
    it('parses a static rule with ID', () => {
      const result = parseRuleLine('# [static:no-console-log] Never use console.log');
      assert.deepEqual(result, {
        type: 'static',
        id: 'no-console-log',
        text: 'Never use console.log',
      });
    });

    it('parses an LLM rule', () => {
      const result = parseRuleLine('# [llm] Never concatenate SQL strings.');
      assert.deepEqual(result, {
        type: 'llm',
        id: '',
        text: 'Never concatenate SQL strings.',
      });
    });

    it('rejects [static] with no ID', () => {
      assert.throws(() => parseRuleLine('# [static] Some rule'), /must include a rule ID/);
    });

    it('parses [ast:rule-id] as reserved (skipped with warning)', () => {
      const result = parseRuleLine('# [ast:func-length] Max 50 lines');
      assert.deepEqual(result, {
        type: 'ast',
        id: 'func-length',
        text: 'Max 50 lines',
      });
    });

    it('returns null for non-rule lines', () => {
      assert.equal(parseRuleLine('## Some heading'), null);
      assert.equal(parseRuleLine(''), null);
      assert.equal(parseRuleLine('Just a comment'), null);
    });
  });

  describe('parseRuleFile', () => {
    it('extracts all rules from a rule file string', () => {
      const content = [
        '# .guardrails.md',
        '',
        '## Static Rules',
        '# [static:no-todo-comments] No TODO or FIXME comments.',
        '# [static:no-console-log] No console.log.',
        '',
        '## LLM Rules',
        '# [llm] Never concatenate SQL strings.',
        '# [llm] Never hardcode secrets.',
      ].join('\n');

      const { rules } = parseRuleFile(content);
      assert.equal(rules.length, 4);
      assert.equal(rules.filter(r => r.type === 'static').length, 2);
      assert.equal(rules.filter(r => r.type === 'llm').length, 2);
    });

    it('handles multi-line LLM rules (continuation lines starting with #)', () => {
      const content = [
        '# [llm] Never construct SQL queries by concatenating variables.',
        '#        Use parameterized queries or a query builder.',
      ].join('\n');

      const { rules } = parseRuleFile(content);
      assert.equal(rules.length, 1);
      assert.ok(rules[0].text.includes('parameterized queries'));
    });
  });

  describe('loadConfig', () => {
    it('extracts config keys from rule file', () => {
      const content = [
        'model: qwen2.5-coder:1.5b',
        'dashboard_url: https://example.com',
        'privacy_mode: strict',
        'banned_imports: lodash, moment',
        'ollama_timeout: 30',
        'bypass_lookback: 15',
        '',
        '# [static:no-console-log] No console.log.',
      ].join('\n');

      const config = loadConfig(content);
      assert.equal(config.model, 'qwen2.5-coder:1.5b');
      assert.equal(config.dashboard_url, 'https://example.com');
      assert.equal(config.privacy_mode, 'strict');
      assert.equal(config.ollama_timeout, 30);
      assert.equal(config.bypass_lookback, 15);
      assert.deepEqual(config.banned_imports, ['lodash', 'moment']);
    });

    it('returns defaults for missing keys', () => {
      const config = loadConfig('');
      assert.equal(config.model, 'qwen2.5-coder:1.5b');
      assert.equal(config.ollama_timeout, 20);
      assert.equal(config.bypass_lookback, 10);
      assert.equal(config.privacy_mode, undefined);
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**
  Run: `node --test tests/core/rule-loader.test.js`
  Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

  `src/core/rule-loader.js`:
  ```javascript
  import { readFileSync, existsSync } from 'node:fs';
  import { resolve, dirname } from 'node:path';

  /**
   * Regex for parsing rule tags.
   * Matches: # [static:rule-id], # [llm], # [ast:rule-id]
   */
  const RULE_TAG_REGEX = /^\s*#\s*\[(static|llm|ast):?([\w-]*)\]/;

  /**
   * Regex for continuation lines (# followed by spaces and text, no tag).
   */
  const CONTINUATION_REGEX = /^\s*#\s{2,}(.+)$/;

  /**
   * Config key regex — simple `key: value` at start of line.
   */
  const CONFIG_REGEX = /^(\w[\w_]*)\s*:\s*(.+)$/;

  const DEFAULTS = {
    model: 'qwen2.5-coder:1.5b',
    ollama_timeout: 20,
    bypass_lookback: 10,
  };

  /**
   * Parse a single line into a rule object, or null if not a rule line.
   * Throws if [static] is used without an ID.
   */
  export function parseRuleLine(line) {
    const match = line.match(RULE_TAG_REGEX);
    if (!match) return null;

    const type = match[1];
    const id = match[2] || '';

    if (type === 'static' && !id) {
      throw new Error(
        `[static] tag must include a rule ID, e.g. [static:no-console-log]. ` +
        `Found bare [static] tag with no ID.`
      );
    }

    // Extract rule text after the tag
    const tagEnd = line.indexOf(']') + 1;
    const text = line.slice(tagEnd).trim();

    return { type, id, text };
  }

  /**
   * Parse an entire rule file string into { rules, warnings }.
   * Handles multi-line LLM rules where continuation lines start with #
   * followed by extra whitespace.
   */
  export function parseRuleFile(content) {
    const lines = content.split('\n');
    const rules = [];
    const warnings = [];
    let currentRule = null;

    for (const line of lines) {
      // Try to parse as a new rule
      let parsed;
      try {
        parsed = parseRuleLine(line);
      } catch (e) {
        warnings.push(e.message);
        continue;
      }

      if (parsed) {
        // Save previous rule
        if (currentRule) {
          rules.push(currentRule);
        }

        if (parsed.type === 'ast') {
          warnings.push(`[ast:${parsed.id}] is reserved for v2. Skipping.`);
          currentRule = null;
          continue;
        }

        currentRule = parsed;
        continue;
      }

      // Check for continuation line (multi-line rule text)
      if (currentRule) {
        const contMatch = line.match(CONTINUATION_REGEX);
        if (contMatch) {
          currentRule.text += ' ' + contMatch[1].trim();
          continue;
        }
      }

      // Non-rule, non-continuation line — finalize current rule
      if (currentRule && !line.trim().startsWith('#')) {
        rules.push(currentRule);
        currentRule = null;
      }
    }

    // Finalize last rule
    if (currentRule) {
      rules.push(currentRule);
    }

    return { rules, warnings };
  }

  /**
   * Extract config key-value pairs from rule file content.
   * Lines like `model: qwen2.5-coder:1.5b` are parsed as config.
   */
  export function loadConfig(content) {
    const config = { ...DEFAULTS };
    const lines = content.split('\n');

    for (const line of lines) {
      const match = line.match(CONFIG_REGEX);
      if (!match) continue;

      const key = match[1];
      let value = match[2].trim();

      // Type coercion for known numeric keys
      if (['ollama_timeout', 'bypass_lookback'].includes(key)) {
        value = parseInt(value, 10);
        if (isNaN(value)) continue;
      }

      // Parse comma-separated lists
      if (key === 'banned_imports') {
        value = value.split(',').map(s => s.trim()).filter(Boolean);
      }

      config[key] = value;
    }

    return config;
  }

  /**
   * Walk up directory tree from startDir to find the nearest .guardrails.md.
   * Returns { filePath, content } or null if not found.
   */
  export function findRuleFile(startDir) {
    let dir = resolve(startDir);
    const root = resolve('/');

    while (dir !== root) {
      const candidate = resolve(dir, '.guardrails.md');
      if (existsSync(candidate)) {
        return {
          filePath: candidate,
          content: readFileSync(candidate, 'utf8'),
        };
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }

    return null;
  }

  /**
   * Full loader: find rule file, parse rules, load config.
   * Returns { rules, config, warnings, filePath } or throws if not found.
   */
  export function loadRules(startDir) {
    const found = findRuleFile(startDir);
    if (!found) {
      throw new Error(
        "No .guardrails.md found in this repo. Run: guardrails init"
      );
    }

    const { rules, warnings } = parseRuleFile(found.content);
    const config = loadConfig(found.content);

    return {
      rules,
      config,
      warnings,
      filePath: found.filePath,
    };
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**
  Run: `node --test tests/core/rule-loader.test.js`
  Expected: All tests PASS

- [ ] **Step 5: Commit**
  ```bash
  git add src/core/rule-loader.js tests/core/rule-loader.test.js
  git commit -m "feat: rule loader with static/LLM split and config parsing"
  ```

---

### Task 2.3: Static Runner — `src/core/static-runner.js`

**Files:**
- Create: `src/core/static-runner.js`
- Create: `tests/core/static-runner.test.js`

- [ ] **Step 1: Write the failing tests**

  `tests/core/static-runner.test.js`:
  ```javascript
  import { describe, it } from 'node:test';
  import assert from 'node:assert/strict';
  import { runStaticChecks } from '../src/core/static-runner.js';

  describe('runStaticChecks', () => {
    it('detects console.log', () => {
      const rules = [{ type: 'static', id: 'no-console-log', text: '' }];
      const violations = runStaticChecks('+  console.log("hello");', rules);
      assert.equal(violations.length, 1);
      assert.equal(violations[0].rule, 'no-console-log');
    });

    it('detects TODO comments', () => {
      const rules = [{ type: 'static', id: 'no-todo-comments', text: '' }];
      const violations = runStaticChecks('+  // TODO: fix this', rules);
      assert.equal(violations.length, 1);
      assert.equal(violations[0].rule, 'no-todo-comments');
    });

    it('detects FIXME comments', () => {
      const rules = [{ type: 'static', id: 'no-todo-comments', text: '' }];
      const violations = runStaticChecks('+  // FIXME: broken', rules);
      assert.equal(violations.length, 1);
    });

    it('detects debug: true', () => {
      const rules = [{ type: 'static', id: 'no-debug-flag', text: '' }];
      const violations = runStaticChecks('+  debug: true', rules);
      assert.equal(violations.length, 1);
    });

    it('detects http:// URLs but not localhost', () => {
      const rules = [{ type: 'static', id: 'no-http-urls', text: '' }];
      assert.equal(runStaticChecks('+  const url = "http://example.com"', rules).length, 1);
      assert.equal(runStaticChecks('+  const url = "http://localhost:3000"', rules).length, 0);
    });

    it('detects banned imports', () => {
      const rules = [{ type: 'static', id: 'no-banned-import', text: '' }];
      const config = { banned_imports: ['lodash'] };
      const diff = "+import _ from 'lodash';";
      const violations = runStaticChecks(diff, rules, config);
      assert.equal(violations.length, 1);
    });

    it('skips banned import check when no banned_imports config', () => {
      const rules = [{ type: 'static', id: 'no-banned-import', text: '' }];
      const violations = runStaticChecks("+import _ from 'lodash';", rules, {});
      assert.equal(violations.length, 0);
    });

    it('skips LLM rules entirely', () => {
      const rules = [{ type: 'llm', id: '', text: 'Never do bad stuff' }];
      const violations = runStaticChecks('+  console.log("hello");', rules);
      assert.equal(violations.length, 0);
    });

    it('warns and skips unknown static IDs', () => {
      const rules = [{ type: 'static', id: 'no-consol-log', text: '' }];
      const violations = runStaticChecks('+  console.log("hello");', rules);
      assert.equal(violations.length, 0);
    });

    it('returns no violations for clean code', () => {
      const rules = [
        { type: 'static', id: 'no-console-log', text: '' },
        { type: 'static', id: 'no-todo-comments', text: '' },
      ];
      const violations = runStaticChecks('+  logger.info("hello");', rules);
      assert.equal(violations.length, 0);
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**
  Run: `node --test tests/core/static-runner.test.js`
  Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

  `src/core/static-runner.js`:
  ```javascript
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  const BUILTIN_CHECKERS = {
    'no-console-log':   (diff) => /console\.log/.test(diff),
    'no-todo-comments': (diff) => /\/\/\s*(TODO|FIXME)/i.test(diff),
    'no-debug-flag':    (diff) => /debug:\s*true/.test(diff),
    'no-http-urls':     (diff) => /http:\/\/(?!localhost)/.test(diff),
    'no-banned-import': (diff, config) => {
      if (!config.banned_imports || !config.banned_imports.length) return false;
      return config.banned_imports.some(pkg => {
        const pattern = new RegExp(`import.*['"]${escapeRegex(pkg)}['"]`);
        return pattern.test(diff);
      });
    },
  };

  // v2: language-specific AST plugins register here
  const AST_PLUGINS = {};

  /**
   * Run all static checks against a diff string.
   * Returns an array of { rule, type } violation objects.
   */
  export function runStaticChecks(diff, rules, config = {}) {
    return rules
      .filter(r => r.type === 'static')
      .flatMap(r => {
        if (!r.id) {
          // [static] with no ID — should be rejected at rule-loader level
          return [];
        }
        const checker = BUILTIN_CHECKERS[r.id] ?? AST_PLUGINS[r.language]?.[r.id];
        if (!checker) {
          console.warn(
            `[guardrails] Unknown static rule ID: '${r.id}' — skipping. ` +
            `Valid IDs: ${Object.keys(BUILTIN_CHECKERS).join(', ')}`
          );
          return [];
        }
        return checker(diff, config) ? [{ rule: r.id, type: 'static' }] : [];
      });
  }

  export { BUILTIN_CHECKERS };
  ```

- [ ] **Step 4: Run tests to verify they pass**
  Run: `node --test tests/core/static-runner.test.js`
  Expected: All 10 tests PASS

- [ ] **Step 5: Commit**
  ```bash
  git add src/core/static-runner.js tests/core/static-runner.test.js
  git commit -m "feat: static runner with 5 built-in checkers"
  ```

---

### Task 2.4: Response Parser — `src/core/response-parser.js`

**Files:**
- Create: `src/core/response-parser.js`
- Create: `tests/core/response-parser.test.js`

- [ ] **Step 1: Write the failing tests**

  `tests/core/response-parser.test.js`:
  ```javascript
  import { describe, it } from 'node:test';
  import assert from 'node:assert/strict';
  import { parseResponse } from '../src/core/response-parser.js';

  describe('parseResponse', () => {
    it('parses a valid pass response', () => {
      const raw = '{"status":"pass","violations":[]}';
      const result = parseResponse(raw);
      assert.equal(result.status, 'pass');
      assert.deepEqual(result.violations, []);
    });

    it('parses a valid fail response', () => {
      const raw = JSON.stringify({
        status: 'fail',
        violations: [{ rule: 'no SQL concat', reason: 'string concatenation found' }],
      });
      const result = parseResponse(raw);
      assert.equal(result.status, 'fail');
      assert.equal(result.violations.length, 1);
    });

    it('returns infrastructure_error for invalid JSON', () => {
      const result = parseResponse('This is not JSON at all');
      assert.equal(result.status, 'infrastructure_error');
      assert.deepEqual(result.violations, []);
    });

    it('returns infrastructure_error for invalid status', () => {
      const raw = '{"status":"maybe","violations":[]}';
      const result = parseResponse(raw);
      assert.equal(result.status, 'infrastructure_error');
    });

    it('returns infrastructure_error when violations is not an array', () => {
      const raw = '{"status":"pass","violations":"none"}';
      const result = parseResponse(raw);
      assert.equal(result.status, 'infrastructure_error');
    });

    it('handles leading/trailing whitespace in raw response', () => {
      const raw = '  \n {"status":"pass","violations":[]}  \n ';
      const result = parseResponse(raw);
      assert.equal(result.status, 'pass');
    });

    it('strips markdown fences if model wraps JSON in them', () => {
      const raw = '```json\n{"status":"pass","violations":[]}\n```';
      const result = parseResponse(raw);
      assert.equal(result.status, 'pass');
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**
  Run: `node --test tests/core/response-parser.test.js`
  Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

  `src/core/response-parser.js`:
  ```javascript
  /**
   * Parse and validate an LLM response string.
   * Returns { status, violations, raw? }.
   *
   * Malformed responses => { status: 'infrastructure_error', violations: [] }
   * The commit is allowed through on infrastructure errors (fail-open).
   */
  export function parseResponse(raw) {
    let cleaned = raw.trim();

    // Strip markdown code fences if the model wraps JSON in them
    const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return { status: 'infrastructure_error', violations: [], raw };
    }

    if (!['pass', 'fail'].includes(parsed.status)) {
      return { status: 'infrastructure_error', violations: [], raw };
    }

    if (!Array.isArray(parsed.violations)) {
      return { status: 'infrastructure_error', violations: [], raw };
    }

    return parsed;
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**
  Run: `node --test tests/core/response-parser.test.js`
  Expected: All 7 tests PASS

- [ ] **Step 5: Commit**
  ```bash
  git add src/core/response-parser.js tests/core/response-parser.test.js
  git commit -m "feat: strict response parser with no regex fallback"
  ```

---

### Task 2.5: Cache Layer — `src/core/cache.js`

**Files:**
- Create: `src/core/cache.js`
- Create: `tests/core/cache.test.js`

- [ ] **Step 1: Write the failing tests**

  `tests/core/cache.test.js`:
  ```javascript
  import { describe, it, beforeEach } from 'node:test';
  import assert from 'node:assert/strict';
  import { Cache } from '../src/core/cache.js';
  import { mkdtempSync, rmSync } from 'node:fs';
  import { join } from 'node:path';
  import { tmpdir } from 'node:os';

  describe('Cache', () => {
    let cache;
    let tempDir;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'guardrails-cache-test-'));
      cache = new Cache(join(tempDir, 'cache.json'));
    });

    it('returns null for cache miss', () => {
      assert.equal(cache.get('foo.js', 'diffcontent'), null);
    });

    it('returns cached result for cache hit', () => {
      const result = { status: 'pass', violations: [] };
      cache.set('foo.js', 'diffcontent', result);
      const hit = cache.get('foo.js', 'diffcontent');
      assert.deepEqual(hit, result);
    });

    it('misses when diff content changes', () => {
      cache.set('foo.js', 'old-diff', { status: 'pass', violations: [] });
      assert.equal(cache.get('foo.js', 'new-diff'), null);
    });

    it('expires entries older than TTL', () => {
      cache.set('foo.js', 'diffcontent', { status: 'pass', violations: [] });
      // Manually age the entry
      const key = cache._makeKey('foo.js', 'diffcontent');
      cache._store[key].timestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      assert.equal(cache.get('foo.js', 'diffcontent'), null);
    });

    it('persists to disk and loads on construction', () => {
      const cachePath = join(tempDir, 'persist-test.json');
      const c1 = new Cache(cachePath);
      c1.set('foo.js', 'diff', { status: 'pass', violations: [] });
      c1.save();

      const c2 = new Cache(cachePath);
      assert.deepEqual(c2.get('foo.js', 'diff'), { status: 'pass', violations: [] });
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**
  Run: `node --test tests/core/cache.test.js`
  Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

  `src/core/cache.js`:
  ```javascript
  import { createHash } from 'node:crypto';
  import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
  import { dirname, join } from 'node:path';
  import { homedir } from 'node:os';

  const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  export class Cache {
    constructor(cachePath = null, ttlMs = DEFAULT_TTL_MS) {
      this._path = cachePath || join(homedir(), '.guardrails', 'cache.json');
      this._ttlMs = ttlMs;
      this._store = {};
      this._load();
    }

    _makeKey(filePath, diffContent) {
      return createHash('sha256').update(filePath + diffContent).digest('hex');
    }

    _load() {
      try {
        if (existsSync(this._path)) {
          this._store = JSON.parse(readFileSync(this._path, 'utf8'));
        }
      } catch {
        this._store = {};
      }
    }

    get(filePath, diffContent) {
      const key = this._makeKey(filePath, diffContent);
      const entry = this._store[key];
      if (!entry) return null;

      // Check TTL
      if (Date.now() - entry.timestamp > this._ttlMs) {
        delete this._store[key];
        return null;
      }

      return entry.result;
    }

    set(filePath, diffContent, result) {
      const key = this._makeKey(filePath, diffContent);
      this._store[key] = { result, timestamp: Date.now() };
    }

    save() {
      const dir = dirname(this._path);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this._path, JSON.stringify(this._store, null, 2));
    }
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**
  Run: `node --test tests/core/cache.test.js`
  Expected: All 5 tests PASS

- [ ] **Step 5: Commit**
  ```bash
  git add src/core/cache.js tests/core/cache.test.js
  git commit -m "feat: file-level diff cache with SHA256 keys and 24h TTL"
  ```

---

### Task 2.6: Prompt Builder — `src/core/prompt-builder.js`

**Files:**
- Create: `src/core/prompt-builder.js`
- Create: `tests/core/prompt-builder.test.js`

- [ ] **Step 1: Write the failing tests**

  `tests/core/prompt-builder.test.js`:
  ```javascript
  import { describe, it } from 'node:test';
  import assert from 'node:assert/strict';
  import { buildPrompt } from '../src/core/prompt-builder.js';

  describe('buildPrompt', () => {
    const rules = [
      { type: 'llm', id: '', text: 'Never concatenate SQL strings.' },
      { type: 'llm', id: '', text: 'Never hardcode secrets.' },
    ];
    const diff = '+  const q = "SELECT * FROM users WHERE id=" + userId;';

    it('includes system instruction', () => {
      const prompt = buildPrompt(rules, diff);
      assert.ok(prompt.includes('You are a code reviewer'));
    });

    it('includes all LLM rules numbered', () => {
      const prompt = buildPrompt(rules, diff);
      assert.ok(prompt.includes('1. Never concatenate SQL strings.'));
      assert.ok(prompt.includes('2. Never hardcode secrets.'));
    });

    it('includes the diff', () => {
      const prompt = buildPrompt(rules, diff);
      assert.ok(prompt.includes(diff));
    });

    it('includes JSON schema instruction', () => {
      const prompt = buildPrompt(rules, diff);
      assert.ok(prompt.includes('"status": "pass" | "fail"'));
      assert.ok(prompt.includes('Return ONLY a JSON object'));
    });

    it('filters out non-LLM rules', () => {
      const mixed = [
        { type: 'static', id: 'no-console-log', text: 'No console.log' },
        { type: 'llm', id: '', text: 'Never hardcode secrets.' },
      ];
      const prompt = buildPrompt(mixed, diff);
      assert.ok(!prompt.includes('No console.log'));
      assert.ok(prompt.includes('Never hardcode secrets.'));
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**
  Run: `node --test tests/core/prompt-builder.test.js`
  Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

  `src/core/prompt-builder.js`:
  ```javascript
  /**
   * Build the structured prompt for Ollama.
   * Only includes rules with type === 'llm'.
   * The prompt structure is fixed and not user-configurable.
   */
  export function buildPrompt(rules, diff) {
    const llmRules = rules.filter(r => r.type === 'llm');

    const numberedRules = llmRules
      .map((r, i) => `${i + 1}. ${r.text}`)
      .join('\n');

    return `You are a code reviewer enforcing a strict set of rules. You will be given a git diff and a list of rules. Your job is to check whether the diff violates any rule.

Rules:
${numberedRules}

Diff:
${diff}

Return ONLY a JSON object. No prose. No explanation. No markdown.
The JSON must match this exact schema:

{
  "status": "pass" | "fail",
  "violations": [
    {
      "rule": "<exact rule text that was violated>",
      "reason": "<one sentence explaining what in the diff violated the rule>"
    }
  ]
}

If there are no violations, return: {"status": "pass", "violations": []}
Do not include any text outside the JSON object.`;
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**
  Run: `node --test tests/core/prompt-builder.test.js`
  Expected: All 5 tests PASS

- [ ] **Step 5: Commit**
  ```bash
  git add src/core/prompt-builder.js tests/core/prompt-builder.test.js
  git commit -m "feat: prompt builder with fixed structured JSON schema"
  ```

---

### Task 2.7: Ollama Client — `src/core/ollama-client.js`

**Files:**
- Create: `src/core/ollama-client.js`

> No unit tests for the Ollama client — it wraps HTTP calls to a local server. Integration-tested via the pipeline tests in Phase 4 and manually via `guardrails doctor`.

- [ ] **Step 1: Write the implementation**

  `src/core/ollama-client.js`:
  ```javascript
  /**
   * HTTP client for the local Ollama server.
   * Supports streaming output and configurable timeout.
   */

  const DEFAULT_BASE_URL = 'http://localhost:11434';

  /**
   * Check if Ollama is reachable.
   * Returns { ok: true, version } or { ok: false, error }.
   */
  export async function checkOllamaHealth(baseUrl = DEFAULT_BASE_URL) {
    try {
      const res = await fetch(`${baseUrl}/api/version`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json();
      return { ok: true, version: data.version };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /**
   * List locally available models.
   * Returns an array of model name strings.
   */
  export async function listLocalModels(baseUrl = DEFAULT_BASE_URL) {
    try {
      const res = await fetch(`${baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.models || []).map(m => m.name);
    } catch {
      return [];
    }
  }

  /**
   * Send a prompt to Ollama and stream the response.
   * Pipes tokens to stdout in real-time for perceived speed.
   *
   * @param {string} prompt - The full prompt text
   * @param {string} model - Model name (e.g. 'qwen2.5-coder:1.5b')
   * @param {object} options - { timeoutMs, baseUrl, stream (boolean) }
   * @returns {Promise<string>} The complete response text
   */
  export async function generate(prompt, model, options = {}) {
    const {
      timeoutMs = 20000,
      baseUrl = DEFAULT_BASE_URL,
      stream = true,
    } = options;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Ollama returned HTTP ${res.status}`);
      }

      if (!stream) {
        const data = await res.json();
        return data.response;
      }

      // Streaming: read NDJSON line by line
      let fullResponse = '';
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.response) {
              process.stdout.write(chunk.response);
              fullResponse += chunk.response;
            }
          } catch {
            // Skip malformed NDJSON lines
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.response) {
            process.stdout.write(chunk.response);
            fullResponse += chunk.response;
          }
        } catch {
          // Skip
        }
      }

      process.stdout.write('\n');
      return fullResponse;
    } catch (e) {
      if (e.name === 'AbortError') {
        throw new Error(`Ollama review timed out after ${timeoutMs / 1000}s`);
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Pull a model from Ollama registry.
   * Streams progress to stdout.
   */
  export async function pullModel(model, baseUrl = DEFAULT_BASE_URL) {
    const res = await fetch(`${baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: true }),
    });

    if (!res.ok) {
      throw new Error(`Failed to pull model: HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          if (chunk.status) {
            process.stdout.write(`\r  ${chunk.status}${chunk.completed ? ` ${Math.round(chunk.completed / 1e6)}MB` : ''}`);
          }
        } catch { /* skip */ }
      }
    }

    process.stdout.write('\n');
  }
  ```

- [ ] **Step 2: Commit**
  ```bash
  git add src/core/ollama-client.js
  git commit -m "feat: Ollama HTTP client with streaming and timeout"
  ```

---

### Task 2.8: Telemetry — `src/core/telemetry.js`

**Files:**
- Create: `src/core/telemetry.js`

- [ ] **Step 1: Write the implementation**

  `src/core/telemetry.js`:
  ```javascript
  import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
  import { createHash } from 'node:crypto';
  import { join } from 'node:path';
  import { homedir } from 'node:os';

  class TelemetryInterface {
    async send(event) {
      throw new Error('Not implemented');
    }
  }

  export class LocalTelemetry extends TelemetryInterface {
    constructor() {
      super();
      this._dir = join(homedir(), '.guardrails');
      this._path = join(this._dir, 'history.jsonl');
    }

    async send(event) {
      if (!existsSync(this._dir)) {
        mkdirSync(this._dir, { recursive: true });
      }
      appendFileSync(this._path, JSON.stringify(event) + '\n');
    }
  }

  export class DashboardTelemetry extends TelemetryInterface {
    constructor(config) {
      super();
      this._url = config.dashboard_url;
      this._key = process.env.GUARDRAILS_KEY;
      this._privacyMode = config.privacy_mode;
    }

    _sanitizeFileName(fileName) {
      if (this._privacyMode === 'strict') {
        return createHash('sha256').update(fileName).digest('hex');
      }
      return fileName;
    }

    async send(event) {
      const payload = {
        commit_hash: event.commit_hash,
        author: event.author,
        timestamp: event.timestamp,
        result: event.result, // 'pass' | 'fail' | 'partially_reviewed'
        bypassed: event.bypassed || false,
        files: (event.files || []).map(f => ({
          file_name: this._sanitizeFileName(f.file_name),
          file_hash: createHash('sha256').update(f.file_name).digest('hex'),
          rule_ids: f.rule_ids || [],
        })),
      };

      try {
        await fetch(`${this._url}/api/commits`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this._key}`,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        // Dashboard sync failure is non-blocking — silently skip
      }
    }
  }

  /**
   * Factory: creates the correct telemetry adapter based on config.
   */
  export function createTelemetry(config) {
    if (config.dashboard_url && process.env.GUARDRAILS_KEY) {
      return new DashboardTelemetry(config);
    }
    return new LocalTelemetry();
  }
  ```

- [ ] **Step 2: Commit**
  ```bash
  git add src/core/telemetry.js
  git commit -m "feat: telemetry interface with local and dashboard adapters"
  ```

---

### Task 2.9: Bypass Reconciler — `src/core/bypass.js`

**Files:**
- Create: `src/core/bypass.js`
- Create: `tests/core/bypass.test.js`

- [ ] **Step 1: Write the failing tests**

  `tests/core/bypass.test.js`:
  ```javascript
  import { describe, it } from 'node:test';
  import assert from 'node:assert/strict';
  import { findBypassed } from '../src/core/bypass.js';

  describe('findBypassed', () => {
    it('identifies commits in git log but not in known hashes', () => {
      const gitCommits = [
        { hash: 'aaa', author: 'dev@test.com', timestamp: '2025-01-01T00:00:00Z' },
        { hash: 'bbb', author: 'dev@test.com', timestamp: '2025-01-01T00:01:00Z' },
        { hash: 'ccc', author: 'dev@test.com', timestamp: '2025-01-01T00:02:00Z' },
      ];
      const knownHashes = ['aaa', 'ccc'];

      const bypassed = findBypassed(gitCommits, knownHashes);
      assert.equal(bypassed.length, 1);
      assert.equal(bypassed[0].hash, 'bbb');
    });

    it('returns empty when all commits are known', () => {
      const gitCommits = [{ hash: 'aaa', author: 'dev@test.com', timestamp: '2025-01-01' }];
      const bypassed = findBypassed(gitCommits, ['aaa']);
      assert.equal(bypassed.length, 0);
    });

    it('returns all as bypassed when nothing is known', () => {
      const gitCommits = [
        { hash: 'aaa', author: 'dev@test.com', timestamp: '2025-01-01' },
        { hash: 'bbb', author: 'dev@test.com', timestamp: '2025-01-01' },
      ];
      const bypassed = findBypassed(gitCommits, []);
      assert.equal(bypassed.length, 2);
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**
  Run: `node --test tests/core/bypass.test.js`
  Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

  `src/core/bypass.js`:
  ```javascript
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
  ```

- [ ] **Step 4: Run tests to verify they pass**
  Run: `node --test tests/core/bypass.test.js`
  Expected: All 3 tests PASS

- [ ] **Step 5: Commit**
  ```bash
  git add src/core/bypass.js tests/core/bypass.test.js
  git commit -m "feat: bypass reconciler comparing git log vs commits table"
  ```

---

### Task 2.10: Local DB — `src/core/local-db.js`

> **Design decision: Pipeline-local DB for bypass detection.**
>
> The spec says bypass reconciliation runs at the START of every pre-commit hook run,
> comparing the `commits` table against `git log`. This means a local database must
> always exist — it cannot depend on the optional dashboard being connected.
>
> The pipeline uses its own lightweight SQLite DB at `~/.guardrails/local.db` with
> only the `commits` table. This is separate from the dashboard's
> `./data/guardrails.db` which has both `commits` and `violations` tables.
>
> - **`~/.guardrails/local.db`** — always exists, used by the pre-commit pipeline
>   for bypass detection and recording reviewed commits
> - **Dashboard DB** — only used by the dashboard server for team-visible data
>
> The `LocalDB` class exposes only the methods needed by `bypass.js` and `pipeline.js`:
> `insertCommit`, `getKnownHashes`, `markBypassed`.

**Files:**
- Create: `src/core/local-db.js`
- Create: `tests/core/local-db.test.js`

- [ ] **Step 1: Write the failing tests**

  `tests/core/local-db.test.js`:
  ```javascript
  import { describe, it, beforeEach } from 'node:test';
  import assert from 'node:assert/strict';
  import { LocalDB } from '../src/core/local-db.js';

  describe('LocalDB', () => {
    let db;

    beforeEach(() => {
      db = new LocalDB(':memory:');
    });

    it('inserts a reviewed commit and retrieves its hash', () => {
      db.insertCommit('abc123def456', 'dev@test.com', '2025-01-01T00:00:00Z');
      const known = db.getKnownHashes(['abc123def456', 'unknown']);
      assert.deepEqual(known, ['abc123def456']);
    });

    it('marks a bypassed commit', () => {
      db.markBypassed('abc123def456', 'dev@test.com', '2025-01-01T00:00:00Z');
      const known = db.getKnownHashes(['abc123def456']);
      assert.deepEqual(known, ['abc123def456']);
    });

    it('does not duplicate on re-insert', () => {
      db.insertCommit('abc123def456', 'dev@test.com', '2025-01-01T00:00:00Z');
      db.insertCommit('abc123def456', 'dev@test.com', '2025-01-01T00:00:00Z');
      const known = db.getKnownHashes(['abc123def456']);
      assert.equal(known.length, 1);
    });

    it('returns empty array when no hashes match', () => {
      const known = db.getKnownHashes(['nonexistent']);
      assert.deepEqual(known, []);
    });

    it('handles empty hash list', () => {
      const known = db.getKnownHashes([]);
      assert.deepEqual(known, []);
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**
  Run: `node --test tests/core/local-db.test.js`
  Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

  `src/core/local-db.js`:
  ```javascript
  import Database from 'better-sqlite3';
  import { mkdirSync, existsSync } from 'node:fs';
  import { join, dirname } from 'node:path';
  import { homedir } from 'node:os';

  /**
   * Lightweight local SQLite database for the pre-commit pipeline.
   * Stores only the commits table — used for bypass detection and
   * recording which commits were reviewed.
   *
   * Located at ~/.guardrails/local.db (separate from the dashboard DB).
   * This DB always exists, even without the dashboard.
   */
  export class LocalDB {
    constructor(dbPath = null) {
      if (!dbPath || dbPath === ':memory:') {
        this.db = new Database(dbPath || ':memory:');
      } else {
        const dir = dirname(dbPath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        this.db = new Database(dbPath);
      }
      this.db.pragma('journal_mode = WAL');
      this._migrate();
    }

    _migrate() {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS commits (
          commit_hash TEXT PRIMARY KEY,
          author      TEXT NOT NULL,
          timestamp   TEXT NOT NULL,
          bypassed    INTEGER DEFAULT 0
        );
      `);
    }

    /**
     * Record a reviewed commit.
     */
    insertCommit(commitHash, author, timestamp) {
      this.db.prepare(
        `INSERT OR IGNORE INTO commits (commit_hash, author, timestamp, bypassed)
         VALUES (?, ?, ?, 0)`
      ).run(commitHash, author, timestamp);
    }

    /**
     * Mark a commit as bypassed (found in git log but not in commits table).
     */
    markBypassed(commitHash, author, timestamp) {
      const existing = this.db.prepare(
        'SELECT commit_hash FROM commits WHERE commit_hash = ?'
      ).get(commitHash);

      if (!existing) {
        this.db.prepare(
          `INSERT INTO commits (commit_hash, author, timestamp, bypassed)
           VALUES (?, ?, ?, 1)`
        ).run(commitHash, author, timestamp);
      }
    }

    /**
     * Return which of the given hashes are already in the commits table.
     */
    getKnownHashes(hashes) {
      if (hashes.length === 0) return [];
      const placeholders = hashes.map(() => '?').join(',');
      const rows = this.db.prepare(
        `SELECT commit_hash FROM commits WHERE commit_hash IN (${placeholders})`
      ).all(...hashes);
      return rows.map(r => r.commit_hash);
    }

    close() {
      this.db.close();
    }
  }

  /**
   * Default path for the local DB.
   */
  export function getLocalDBPath() {
    return join(homedir(), '.guardrails', 'local.db');
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**
  Run: `node --test tests/core/local-db.test.js`
  Expected: All 5 tests PASS

- [ ] **Step 5: Commit**
  ```bash
  git add src/core/local-db.js tests/core/local-db.test.js
  git commit -m "feat: local SQLite DB for bypass detection and commit tracking"
  ```

---

## Phase 3: CLI Commands

---

### Task 3.1: `guardrails install` — Git hook installer

**Files:**
- Create: `src/commands/install.js`
- Create: `tests/commands/install.test.js`
- Modify: `src/cli.js` — register command

- [ ] **Step 1: Write the failing tests**

  `tests/commands/install.test.js`:
  ```javascript
  import { describe, it, beforeEach } from 'node:test';
  import assert from 'node:assert/strict';
  import { generateHookScript } from '../src/commands/install.js';

  describe('generateHookScript', () => {
    it('produces a bash script that calls guardrails', () => {
      const script = generateHookScript();
      assert.ok(script.startsWith('#!/bin/sh'));
      assert.ok(script.includes('guardrails'));
      assert.ok(script.includes('review'));
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**
  Run: `node --test tests/commands/install.test.js`
  Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

  `src/commands/install.js`:
  ```javascript
  import { writeFileSync, chmodSync, existsSync, mkdirSync } from 'node:fs';
  import { execSync } from 'node:child_process';
  import { join } from 'node:path';

  const HOOK_SCRIPT = `#!/bin/sh
# Guardrails pre-commit hook — installed by: guardrails install
# Do not edit manually. Re-run 'guardrails install' to update.

guardrails review
`;

  export function generateHookScript() {
    return HOOK_SCRIPT;
  }

  export async function install() {
    // Find the git root
    let gitRoot;
    try {
      gitRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
    } catch {
      console.error('Error: Not inside a git repository.');
      process.exit(1);
    }

    const hooksDir = join(gitRoot, '.git', 'hooks');
    const hookPath = join(hooksDir, 'pre-commit');

    if (!existsSync(hooksDir)) {
      mkdirSync(hooksDir, { recursive: true });
    }

    // Check for existing hook
    if (existsSync(hookPath)) {
      console.warn('Warning: Existing pre-commit hook found. Overwriting.');
    }

    writeFileSync(hookPath, HOOK_SCRIPT);

    // Make executable on Unix
    try {
      chmodSync(hookPath, '755');
    } catch {
      // chmod may fail on Windows — not a problem
    }

    console.log(`✓ Pre-commit hook installed at ${hookPath}`);
    console.log('  Every commit will now be reviewed by Guardrails.');
  }
  ```

- [ ] **Step 4: Register the command in `src/cli.js`**

  Add to `src/cli.js` after the existing `program` setup:
  ```javascript
  import { install } from './commands/install.js';

  // Inside createCLI():
  program
    .command('install')
    .description('Install the Guardrails pre-commit hook')
    .action(install);
  ```

- [ ] **Step 5: Run tests to verify they pass**
  Run: `node --test tests/commands/install.test.js`
  Expected: All tests PASS

- [ ] **Step 6: Commit**
  ```bash
  git add src/commands/install.js tests/commands/install.test.js src/cli.js
  git commit -m "feat: guardrails install command"
  ```

---

### Task 3.2: `guardrails doctor` — Environment health check

**Files:**
- Create: `src/commands/doctor.js`
- Create: `tests/commands/doctor.test.js`
- Modify: `src/cli.js` — register command

- [ ] **Step 1: Write the failing tests**

  `tests/commands/doctor.test.js`:
  ```javascript
  import { describe, it } from 'node:test';
  import assert from 'node:assert/strict';
  import { formatCheckResult } from '../src/commands/doctor.js';

  describe('formatCheckResult', () => {
    it('formats OK result', () => {
      const line = formatCheckResult({ ok: true, label: 'Ollama installed', detail: 'v0.3.6' });
      assert.ok(line.includes('[OK]'));
      assert.ok(line.includes('Ollama installed'));
      assert.ok(line.includes('v0.3.6'));
    });

    it('formats FAIL result with fix', () => {
      const line = formatCheckResult({
        ok: false,
        label: 'Model not found',
        detail: 'qwen2.5-coder:1.5b',
        fix: 'ollama pull qwen2.5-coder:1.5b',
      });
      assert.ok(line.includes('[FAIL]'));
      assert.ok(line.includes('Fix:'));
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**
  Run: `node --test tests/commands/doctor.test.js`
  Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

  `src/commands/doctor.js`:
  ```javascript
  import { execSync } from 'node:child_process';
  import { checkOllamaHealth, listLocalModels } from '../core/ollama-client.js';
  import { loadRules } from '../core/rule-loader.js';

  export function formatCheckResult({ ok, label, detail, fix }) {
    const icon = ok ? '[OK]  ' : '[FAIL]';
    let line = `  ${icon} ${label}`;
    if (detail) line += `        (${detail})`;
    if (!ok && fix) line += `\n           Fix: ${fix}`;
    return line;
  }

  export async function doctor() {
    console.log('\nChecking Guardrails environment...\n');

    const checks = [];

    // 1. Ollama binary installed
    let ollamaInstalled = false;
    try {
      const version = execSync('ollama --version', { encoding: 'utf8' }).trim();
      checks.push({ ok: true, label: 'Ollama installed', detail: version });
      ollamaInstalled = true;
    } catch {
      checks.push({
        ok: false,
        label: 'Ollama not installed',
        detail: null,
        fix: 'Install Ollama from https://ollama.com, then run guardrails doctor',
      });
    }

    // 2. Ollama running
    let ollamaRunning = false;
    if (ollamaInstalled) {
      const health = await checkOllamaHealth();
      if (health.ok) {
        checks.push({ ok: true, label: 'Ollama running', detail: `localhost:11434` });
        ollamaRunning = true;
      } else {
        checks.push({
          ok: false,
          label: 'Ollama not running',
          detail: health.error,
          fix: 'Start Ollama with: ollama serve',
        });
      }
    }

    // 3. Model available
    let modelName = 'qwen2.5-coder:1.5b';
    try {
      const { config } = loadRules(process.cwd());
      modelName = config.model || modelName;
    } catch { /* use default */ }

    if (ollamaRunning) {
      const models = await listLocalModels();
      const found = models.some(m => m.startsWith(modelName));
      if (found) {
        checks.push({ ok: true, label: 'Model found', detail: modelName });
      } else {
        checks.push({
          ok: false,
          label: 'Model not found',
          detail: modelName,
          fix: `ollama pull ${modelName}`,
        });
      }
    }

    // 4. .guardrails.md found
    try {
      const { rules, filePath } = loadRules(process.cwd());
      const staticCount = rules.filter(r => r.type === 'static').length;
      const llmCount = rules.filter(r => r.type === 'llm').length;
      checks.push({
        ok: true,
        label: '.guardrails.md found',
        detail: `${staticCount} static rules, ${llmCount} LLM rules`,
      });
    } catch {
      checks.push({
        ok: false,
        label: '.guardrails.md not found',
        detail: null,
        fix: 'Run: guardrails init',
      });
    }

    // Print results
    for (const check of checks) {
      console.log(formatCheckResult(check));
    }

    const failures = checks.filter(c => !c.ok);
    console.log('');
    if (failures.length === 0) {
      console.log('All checks passed. Guardrails is ready.');
    } else {
      console.log(`${failures.length} check(s) failed. Fix the issues above and run 'guardrails doctor' again.`);
      process.exitCode = 1;
    }
  }
  ```

- [ ] **Step 4: Register the command in `src/cli.js`**

  Add import and command registration:
  ```javascript
  import { doctor } from './commands/doctor.js';

  program
    .command('doctor')
    .description('Check your Guardrails environment')
    .action(doctor);
  ```

- [ ] **Step 5: Run tests to verify they pass**
  Run: `node --test tests/commands/doctor.test.js`
  Expected: All tests PASS

- [ ] **Step 6: Commit**
  ```bash
  git add src/commands/doctor.js tests/commands/doctor.test.js src/cli.js
  git commit -m "feat: guardrails doctor environment health check"
  ```

---

### Task 3.3: `guardrails benchmark` — Model speed test

**Files:**
- Create: `src/commands/benchmark.js`
- Modify: `src/cli.js` — register command

- [ ] **Step 1: Write the implementation**

  `src/commands/benchmark.js`:
  ```javascript
  import { listLocalModels, generate } from '../core/ollama-client.js';
  import { loadRules } from '../core/rule-loader.js';

  const SAMPLE_DIFF = `--- a/src/db/queries.js
+++ b/src/db/queries.js
@@ -12,7 +12,7 @@
+  const result = await db.query('SELECT * FROM users WHERE id = ' + userId);`;

  const SAMPLE_PROMPT = `You are a code reviewer. Review this diff.
Rules:
1. Never concatenate SQL strings.

Diff:
${SAMPLE_DIFF}

Return ONLY a JSON object: {"status":"pass"|"fail","violations":[]}`;

  const RUNS = 3;

  export async function benchmark() {
    const models = await listLocalModels();

    if (models.length === 0) {
      console.log('No models installed. Run: ollama pull qwen2.5-coder:1.5b');
      process.exit(1);
    }

    // Determine current default model
    let currentModel;
    try {
      const { config } = loadRules(process.cwd());
      currentModel = config.model;
    } catch {
      currentModel = null;
    }

    console.log(`\nBenchmarking installed models (${RUNS} runs each, same sample diff)...\n`);
    console.log('Model                      Avg      Min      Max');
    console.log('---------------------------------------------------');

    for (const model of models) {
      const times = [];
      for (let i = 0; i < RUNS; i++) {
        const start = performance.now();
        try {
          await generate(SAMPLE_PROMPT, model, {
            timeoutMs: 60000,
            stream: false,
          });
          times.push((performance.now() - start) / 1000);
        } catch {
          times.push(NaN);
        }
      }

      const validTimes = times.filter(t => !isNaN(t));
      if (validTimes.length === 0) {
        console.log(`${model.padEnd(27)}FAILED`);
        continue;
      }

      const avg = (validTimes.reduce((a, b) => a + b, 0) / validTimes.length).toFixed(1);
      const min = Math.min(...validTimes).toFixed(1);
      const max = Math.max(...validTimes).toFixed(1);
      const marker = model === currentModel ? '  <- current default' : '';

      console.log(`${model.padEnd(27)}${avg}s    ${min}s    ${max}s${marker}`);
    }

    console.log(`\nThis means commits with LLM rules will take ~avg per file on this machine.`);
    console.log("To change model: update 'model:' in .guardrails.md");
  }

  export { SAMPLE_PROMPT, SAMPLE_DIFF };
  ```

- [ ] **Step 2: Register the command in `src/cli.js`**
  ```javascript
  import { benchmark } from './commands/benchmark.js';

  program
    .command('benchmark')
    .description('Benchmark installed Ollama models')
    .action(benchmark);
  ```

- [ ] **Step 3: Commit**
  ```bash
  git add src/commands/benchmark.js src/cli.js
  git commit -m "feat: guardrails benchmark command"
  ```

---

### Task 3.4: `guardrails init` — Project scaffolding + model selection

**Files:**
- Create: `src/commands/init.js`
- Modify: `src/cli.js` — register command

- [ ] **Step 1: Write the implementation**

  `src/commands/init.js`:
  ```javascript
  import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
  import { join, dirname } from 'node:path';
  import { fileURLToPath } from 'node:url';
  import { createInterface } from 'node:readline';
  import { totalmem } from 'node:os';
  import { checkOllamaHealth, pullModel } from '../core/ollama-client.js';
  import { benchmark as runBenchmark } from './benchmark.js';

  const __dirname = dirname(fileURLToPath(import.meta.url));

  const ALL_MODELS = [
    { name: 'qwen2.5-coder:1.5b', sizeGB: 1.0, label: 'Recommended' },
    { name: 'qwen2.5-coder:3b', sizeGB: 1.9, label: 'More thorough' },
    { name: 'deepseek-coder:1.3b', sizeGB: 0.8, label: 'Fastest' },
  ];

  const TEMPLATES = [
    { name: 'node', file: 'node.guardrails.md', label: 'Node.js' },
    { name: 'react', file: 'react.guardrails.md', label: 'React' },
    { name: 'python', file: 'python.guardrails.md', label: 'Python' },
    { name: 'go', file: 'go.guardrails.md', label: 'Go' },
    { name: 'generic', file: 'generic.guardrails.md', label: 'Generic (language-agnostic)' },
  ];

  function prompt(question) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
      rl.question(question, answer => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  export async function init() {
    console.log('\n🛡️  Guardrails Init\n');

    // 1. Check for existing rule file
    if (existsSync('.guardrails.md')) {
      const overwrite = await prompt('.guardrails.md already exists. Overwrite? (y/N): ');
      if (overwrite.toLowerCase() !== 'y') {
        console.log('Aborted.');
        return;
      }
    }

    // 2. Template selection
    console.log('Select a template:\n');
    TEMPLATES.forEach((t, i) => console.log(`  [${i + 1}] ${t.label}`));
    const templateChoice = await prompt(`\nTemplate [1]: `);
    const templateIndex = parseInt(templateChoice || '1', 10) - 1;
    const template = TEMPLATES[templateIndex] || TEMPLATES[0];

    const templatesDir = join(__dirname, '..', '..', 'templates');
    const templatePath = join(templatesDir, template.file);
    let templateContent;
    try {
      templateContent = readFileSync(templatePath, 'utf8');
    } catch {
      console.error(`Template not found: ${templatePath}`);
      process.exit(1);
    }

    // 3. Model selection
    const totalGB = totalmem() / 1e9;
    const safeGB = totalGB * 0.6;
    const availableModels = ALL_MODELS.filter(m => m.sizeGB <= safeGB);

    console.log(`\nAvailable models (your system: ${Math.round(totalGB)} GB RAM):\n`);
    availableModels.forEach((m, i) => {
      console.log(`  [${i + 1}] ${m.name.padEnd(25)} ~${m.sizeGB} GB   ${m.label}`);
    });

    const modelChoice = await prompt(`\nSelect a model [1]: `);
    const modelIndex = parseInt(modelChoice || '1', 10) - 1;
    const model = availableModels[modelIndex] || availableModels[0];

    // 4. Pull model if Ollama is running
    const health = await checkOllamaHealth();
    if (health.ok) {
      console.log(`\nPulling ${model.name}...`);
      try {
        await pullModel(model.name);
        console.log('Done.\n');

        // 5. Run benchmark
        console.log('Running benchmark on your hardware (3 runs, sample diff)...\n');
        await runBenchmark();
      } catch (e) {
        console.warn(`Could not pull model: ${e.message}`);
        console.warn(`Run manually: ollama pull ${model.name}`);
      }
    } else {
      console.warn('\nOllama is not running. Start it with: ollama serve');
      console.warn(`Then run: ollama pull ${model.name}`);
    }

    // 6. Write .guardrails.md with model config prepended
    const configHeader = `model: ${model.name}\n\n`;
    writeFileSync('.guardrails.md', configHeader + templateContent);
    console.log(`\n✓ Writing model: ${model.name} to .guardrails.md`);
    console.log(`✓ Template: ${template.label}`);
    console.log('\nRun "guardrails install" to set up the pre-commit hook.');
  }
  ```

- [ ] **Step 2: Register the command in `src/cli.js`**
  ```javascript
  import { init } from './commands/init.js';

  program
    .command('init')
    .description('Initialize Guardrails in this project')
    .action(init);
  ```

- [ ] **Step 3: Commit**
  ```bash
  git add src/commands/init.js src/cli.js
  git commit -m "feat: guardrails init with template + model selection + benchmark"
  ```

---

### Task 3.5: `guardrails validate` — Rule testing

**Files:**
- Create: `src/commands/validate.js`
- Modify: `src/cli.js` — register command

- [ ] **Step 1: Write the implementation**

  `src/commands/validate.js`:
  ```javascript
  import { buildPrompt } from '../core/prompt-builder.js';
  import { generate } from '../core/ollama-client.js';
  import { parseResponse } from '../core/response-parser.js';
  import { loadRules } from '../core/rule-loader.js';

  const SAMPLE_DIFFS = [
    {
      label: 'Parameterized query (should PASS)',
      diff: "+  db.query('SELECT * FROM users WHERE id = $1', [userId]);",
      expectViolation: false,
    },
    {
      label: 'String concatenation (should FAIL)',
      diff: "+  db.query('SELECT * FROM users WHERE id = ' + userId);",
      expectViolation: true,
    },
    {
      label: 'Template literal (should FAIL)',
      diff: "+  db.query(`SELECT * FROM users WHERE id = ${userId}`);",
      expectViolation: true,
    },
  ];

  export async function validate(options) {
    const ruleText = options.rule;

    if (!ruleText) {
      console.error('Usage: guardrails validate --rule "Your rule text here"');
      process.exit(1);
    }

    // Try to get model from config, fall back to default
    let model = 'qwen2.5-coder:1.5b';
    try {
      const { config } = loadRules(process.cwd());
      model = config.model || model;
    } catch { /* use default */ }

    const rule = { type: 'llm', id: '', text: ruleText };

    console.log(`\nTesting rule against ${SAMPLE_DIFFS.length} sample diffs...\n`);

    let correct = 0;

    for (const sample of SAMPLE_DIFFS) {
      console.log(`  Sample: ${sample.label}`);
      console.log(`    ${sample.diff}`);

      const prompt = buildPrompt([rule], sample.diff);

      try {
        const raw = await generate(prompt, model, { stream: false, timeoutMs: 30000 });
        const result = parseResponse(raw);

        const hasViolation = result.status === 'fail' && result.violations.length > 0;
        const isCorrect = hasViolation === sample.expectViolation;

        console.log(`    Result: ${result.status.toUpperCase()}  (${isCorrect ? 'correct' : 'INCORRECT'})`);

        if (isCorrect) correct++;
      } catch (e) {
        console.log(`    Error: ${e.message}`);
      }

      console.log('');
    }

    console.log(`Rule ${correct === SAMPLE_DIFFS.length ? 'OK' : 'NEEDS TUNING'}. ${correct}/${SAMPLE_DIFFS.length} samples evaluated correctly.`);
  }
  ```

- [ ] **Step 2: Register the command in `src/cli.js`**
  ```javascript
  import { validate } from './commands/validate.js';

  program
    .command('validate')
    .description('Test a rule against sample diffs')
    .option('--rule <text>', 'The rule text to test')
    .action(validate);
  ```

- [ ] **Step 3: Commit**
  ```bash
  git add src/commands/validate.js src/cli.js
  git commit -m "feat: guardrails validate command for rule testing"
  ```

---

## Phase 4: Main Pipeline

### Task 4.1: Pipeline Orchestrator — `src/core/pipeline.js`

This is the main pre-commit hook flow: diff → bypass reconciler → static checks → (if needed) LLM review → cache → report → telemetry.

**Files:**
- Create: `src/core/pipeline.js`
- Modify: `src/cli.js` — register `review` command

- [ ] **Step 1: Write the implementation**

  `src/core/pipeline.js`:
  ```javascript
  import { getStagedDiff, estimateTokens, getDiffWarning, splitDiffByFile } from './diff.js';
  import { loadRules } from './rule-loader.js';
  import { runStaticChecks } from './static-runner.js';
  import { buildPrompt } from './prompt-builder.js';
  import { generate } from './ollama-client.js';
  import { parseResponse } from './response-parser.js';
  import { Cache } from './cache.js';
  import { createTelemetry } from './telemetry.js';
  import { reconcileBypasses } from './bypass.js';
  import { LocalDB, getLocalDBPath } from './local-db.js';
  import { execSync } from 'node:child_process';
  import { randomUUID } from 'node:crypto';

  /**
   * Format violations for terminal output.
   */
  function formatViolations(violations) {
    if (violations.length === 0) return '';
    let output = '\n🚫 Guardrails: commit blocked\n\n';
    for (const v of violations) {
      if (v.type === 'static') {
        output += `  [static] ${v.rule}\n`;
      } else {
        output += `  [llm] ${v.rule}\n`;
        if (v.reason) output += `         ${v.reason}\n`;
      }
    }
    output += `\n${violations.length} violation(s) found. Fix the issues above and try again.\n`;
    return output;
  }

  /**
   * Run the full pre-commit review pipeline.
   * Returns exit code: 0 = allow, 1 = block.
   */
  export async function runPipeline() {
    // Generate a session ID for this review run.
    // We use a UUID instead of git rev-parse HEAD because the commit
    // object doesn't exist yet at pre-commit time — HEAD still points
    // to the previous commit. This is a known v1 limitation.
    const sessionId = randomUUID();

    // 1. Load rules and config
    let rules, config;
    try {
      const loaded = loadRules(process.cwd());
      rules = loaded.rules;
      config = loaded.config;
      for (const w of loaded.warnings) {
        console.warn(`[guardrails] ${w}`);
      }
    } catch (e) {
      console.log(`Guardrails: ${e.message}`);
      return 0; // fail open — no rule file
    }

    // 2. Bypass reconciliation — ALWAYS runs before the current review.
    // Uses the local SQLite DB at ~/.guardrails/local.db.
    // This is independent of the optional dashboard.
    let localDb;
    try {
      localDb = new LocalDB(getLocalDBPath());
      const bypassed = await reconcileBypasses(localDb, config.bypass_lookback || 10);
      if (bypassed.length > 0) {
        console.log(`[guardrails] ${bypassed.length} bypassed commit(s) detected and recorded.`);
      }
    } catch (e) {
      // Local DB failure is non-blocking — log and continue
      console.warn(`[guardrails] bypass check failed: ${e.message}`);
    }

    // 3. Get staged diff
    let diffText;
    try {
      diffText = getStagedDiff();
    } catch (e) {
      console.log(`Guardrails: ${e.message}`);
      return 0;
    }

    if (!diffText.trim()) {
      return 0; // nothing to review
    }

    // 4. Token estimation + warnings
    const tokens = estimateTokens(diffText);
    const warning = getDiffWarning(tokens);
    if (warning && warning.level === 'warn') {
      console.log(`⚠️  ${warning.message}`);
    }

    // 5. Split by file (always — for caching and per-file review)
    const files = splitDiffByFile(diffText);
    if (files.length === 0) return 0;

    const allViolations = [];
    const cache = new Cache();
    const telemetry = createTelemetry(config);
    const author = getAuthor();

    // 6. Static checks first (on each file's diff)
    const staticRules = rules.filter(r => r.type === 'static');
    const llmRules = rules.filter(r => r.type === 'llm');

    for (const file of files) {
      const staticViolations = runStaticChecks(file.diff, staticRules, config);
      allViolations.push(...staticViolations.map(v => ({ ...v, file: file.filePath })));
    }

    // If static rules already block, skip LLM entirely
    if (allViolations.length > 0) {
      console.log(formatViolations(allViolations));
      // Telemetry — uses sessionId, not a commit hash
      try {
        await telemetry.send({
          commit_hash: sessionId,
          author,
          timestamp: new Date().toISOString(),
          result: 'fail',
          files: allViolations.map(v => ({
            file_name: v.file,
            rule_ids: [v.rule],
          })),
        });
      } catch { /* non-blocking */ }
      cache.save();
      return 1;
    }

    // 7. LLM review for each file (if there are LLM rules)
    if (llmRules.length > 0) {
      const shouldSplit = warning && warning.level === 'split';
      if (shouldSplit) {
        console.log(`📂 ${warning.message}`);
      }

      for (const file of files) {
        // Check cache
        const cached = cache.get(file.filePath, file.diff);
        if (cached) {
          if (cached.status === 'fail') {
            allViolations.push(
              ...cached.violations.map(v => ({
                rule: v.rule,
                reason: v.reason,
                type: 'llm',
                file: file.filePath,
              }))
            );
          }
          continue;
        }

        // Build prompt and call Ollama
        const prompt = buildPrompt(llmRules, file.diff);
        console.log(`\n📝 Reviewing ${file.filePath}...`);

        try {
          const raw = await generate(prompt, config.model, {
            timeoutMs: (config.ollama_timeout || 20) * 1000,
          });
          const result = parseResponse(raw);

          // Cache the result
          cache.set(file.filePath, file.diff, result);

          if (result.status === 'infrastructure_error') {
            console.log(`⚠️  Guardrails: review returned malformed response for ${file.filePath} — skipping`);
            continue;
          }

          if (result.status === 'fail') {
            allViolations.push(
              ...result.violations.map(v => ({
                rule: v.rule,
                reason: v.reason,
                type: 'llm',
                file: file.filePath,
              }))
            );
          }
        } catch (e) {
          // Timeout or Ollama error — fail open
          console.log(`⚠️  Guardrails: ${e.message} — skipping ${file.filePath}`);
          continue;
        }
      }
    }

    cache.save();

    // 8. Report
    if (allViolations.length > 0) {
      console.log(formatViolations(allViolations));

      try {
        await telemetry.send({
          commit_hash: sessionId,
          author,
          timestamp: new Date().toISOString(),
          result: 'fail',
          files: allViolations.map(v => ({
            file_name: v.file,
            rule_ids: [v.rule],
          })),
        });
      } catch { /* non-blocking */ }

      return 1; // block commit
    }

    console.log('\n✅ Guardrails: all checks passed\n');

    // 9. Record this reviewed commit in the local DB.
    // We use the sessionId as the commit_hash. When bypass reconciliation
    // runs on the NEXT commit, it will compare git log (which has the real
    // hash) against this table. The sessionId won't match the real hash,
    // but that's fine — reconcileBypasses looks for git hashes NOT in the
    // table. After the commit succeeds (exit 0), git creates the real
    // commit object. On the next pre-commit run, bypass reconciliation
    // will see the real hash in git log. Since it's not in our table,
    // it would be marked as bypassed — UNLESS we record the real hash.
    //
    // Solution: we use a post-commit-like approach. Since we can't run
    // post-commit (separate process), we record a placeholder now and
    // let reconcileBypasses on the next run detect this commit's real
    // hash in git log. It will see it as "not known" but since it was
    // the immediately-preceding commit and we just ran, the 10-commit
    // lookback window handles this naturally — the reconciler will NOT
    // mark it as bypassed because we insert the real hash into the local
    // DB during reconciliation by checking: if the commit is HEAD~0 and
    // the previous pipeline run was <60s ago, skip it.
    //
    // SIMPLER APPROACH (implemented): We register a post-commit marker.
    // The pipeline writes sessionId to ~/.guardrails/last-session.
    // On the next pipeline run, before reconciliation, we read last-session
    // and backfill the real HEAD hash into the local DB.
    //
    // SIMPLEST APPROACH (implemented below): Just don't record anything
    // at pre-commit time. Let the bypass reconciler on the NEXT run see
    // this commit in git log. Since it's not in the commits table, it
    // looks bypassed. To fix this, the pipeline writes a marker file
    // ~/.guardrails/pending-session containing the sessionId. On the
    // next run, reconcileBypasses reads this file, gets the ACTUAL
    // commit hash from git log for the most recent commit, and inserts
    // it as a reviewed (non-bypassed) commit. Then deletes the marker.

    try {
      const { writeFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { homedir } = await import('node:os');
      const markerPath = join(homedir(), '.guardrails', 'pending-session');
      writeFileSync(markerPath, sessionId);
    } catch { /* non-blocking */ }

    try {
      await telemetry.send({
        commit_hash: sessionId,
        author,
        timestamp: new Date().toISOString(),
        result: 'pass',
        files: files.map(f => ({ file_name: f.filePath, rule_ids: [] })),
      });
    } catch { /* non-blocking */ }

    return 0; // allow commit
  }

  function getAuthor() {
    try {
      return execSync('git config user.email', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }

  export { formatViolations };
  ```

- [ ] **Step 2: Register the `review` command in `src/cli.js`**

  ```javascript
  import { runPipeline } from './core/pipeline.js';

  program
    .command('review')
    .description('Run the pre-commit review pipeline (called by the git hook)')
    .action(async () => {
      const exitCode = await runPipeline();
      process.exit(exitCode);
    });
  ```

- [ ] **Step 3: Manual smoke test**
  Run: `node bin/guardrails.js review`
  Expected: Either "no .guardrails.md found" (exit 0) or runs the pipeline if one exists.

- [ ] **Step 4: Commit**
  ```bash
  git add src/core/pipeline.js src/cli.js
  git commit -m "feat: main pre-commit pipeline orchestrator"
  ```

---

## Phase 5: Dashboard

---

### Task 5.1: SQLite Database — `src/dashboard/db.js`

**Files:**
- Create: `src/dashboard/db.js`
- Create: `tests/dashboard/db.test.js`

- [ ] **Step 1: Write the failing tests**

  `tests/dashboard/db.test.js`:
  ```javascript
  import { describe, it, beforeEach } from 'node:test';
  import assert from 'node:assert/strict';
  import { DashboardDB } from '../src/dashboard/db.js';

  describe('DashboardDB', () => {
    let db;

    beforeEach(() => {
      db = new DashboardDB(':memory:');
    });

    it('inserts and retrieves a commit', () => {
      db.insertCommit({
        id: 'uuid-1',
        commit_hash: 'abc123',
        author: 'dev@test.com',
        timestamp: '2025-01-01T00:00:00Z',
        bypassed: 0,
      });
      const commits = db.getAllCommits();
      assert.equal(commits.length, 1);
      assert.equal(commits[0].commit_hash, 'abc123');
    });

    it('inserts and retrieves violations', () => {
      db.insertCommit({
        id: 'uuid-1',
        commit_hash: 'abc123',
        author: 'dev@test.com',
        timestamp: '2025-01-01T00:00:00Z',
        bypassed: 0,
      });
      db.insertViolation({
        id: 'v-1',
        commit_id: 'uuid-1',
        file_name: 'auth.ts',
        file_hash: 'hashvalue',
        rule_id: 'no-raw-sql',
      });
      const violations = db.getViolationsForCommit('uuid-1');
      assert.equal(violations.length, 1);
      assert.equal(violations[0].rule_id, 'no-raw-sql');
    });

    it('marks commits as bypassed', () => {
      db.markBypassed('abc123', 'dev@test.com', '2025-01-01T00:00:00Z');
      const commits = db.getAllCommits();
      assert.equal(commits.length, 1);
      assert.equal(commits[0].bypassed, 1);
    });

    it('returns known hashes', () => {
      db.insertCommit({
        id: 'uuid-1',
        commit_hash: 'aaa',
        author: 'dev@test.com',
        timestamp: '2025-01-01T00:00:00Z',
        bypassed: 0,
      });
      const known = db.getKnownHashes(['aaa', 'bbb']);
      assert.deepEqual(known, ['aaa']);
    });

    it('returns summary stats', () => {
      db.insertCommit({
        id: 'uuid-1',
        commit_hash: 'aaa',
        author: 'dev@test.com',
        timestamp: '2025-01-01T00:00:00Z',
        bypassed: 0,
      });
      db.insertCommit({
        id: 'uuid-2',
        commit_hash: 'bbb',
        author: 'dev@test.com',
        timestamp: '2025-01-02T00:00:00Z',
        bypassed: 1,
      });
      const stats = db.getStats();
      assert.equal(stats.totalCommits, 2);
      assert.equal(stats.bypassedCommits, 1);
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**
  Run: `node --test tests/dashboard/db.test.js`
  Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

  `src/dashboard/db.js`:
  ```javascript
  import Database from 'better-sqlite3';
  import { v4 as uuidv4 } from 'uuid';

  export class DashboardDB {
    constructor(dbPath = './data/guardrails.db') {
      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');
      this._migrate();
    }

    _migrate() {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS commits (
          id          TEXT PRIMARY KEY,
          commit_hash TEXT NOT NULL,
          author      TEXT NOT NULL,
          timestamp   TEXT NOT NULL,
          bypassed    INTEGER DEFAULT 0,
          session_id  TEXT
        );

        CREATE TABLE IF NOT EXISTS violations (
          id          TEXT PRIMARY KEY,
          commit_id   TEXT REFERENCES commits(id),
          file_name   TEXT,
          file_hash   TEXT,
          rule_id     TEXT NOT NULL,
          resolved    INTEGER DEFAULT 0,
          session_id  TEXT
        );
      `);
    }

    insertCommit({ id, commit_hash, author, timestamp, bypassed = 0 }) {
      const stmt = this.db.prepare(
        `INSERT OR IGNORE INTO commits (id, commit_hash, author, timestamp, bypassed)
         VALUES (?, ?, ?, ?, ?)`
      );
      stmt.run(id || uuidv4(), commit_hash, author, timestamp, bypassed);
    }

    insertViolation({ id, commit_id, file_name, file_hash, rule_id }) {
      const stmt = this.db.prepare(
        `INSERT OR IGNORE INTO violations (id, commit_id, file_name, file_hash, rule_id)
         VALUES (?, ?, ?, ?, ?)`
      );
      stmt.run(id || uuidv4(), commit_id, file_name, file_hash, rule_id);
    }

    markBypassed(commit_hash, author, timestamp) {
      // Check if this commit is already recorded
      const existing = this.db.prepare(
        'SELECT id FROM commits WHERE commit_hash = ?'
      ).get(commit_hash);

      if (!existing) {
        this.insertCommit({
          id: uuidv4(),
          commit_hash,
          author,
          timestamp,
          bypassed: 1,
        });
      }
    }

    getKnownHashes(hashes) {
      if (hashes.length === 0) return [];
      const placeholders = hashes.map(() => '?').join(',');
      const rows = this.db.prepare(
        `SELECT commit_hash FROM commits WHERE commit_hash IN (${placeholders})`
      ).all(...hashes);
      return rows.map(r => r.commit_hash);
    }

    getAllCommits(limit = 100) {
      return this.db.prepare(
        'SELECT * FROM commits ORDER BY timestamp DESC LIMIT ?'
      ).all(limit);
    }

    getViolationsForCommit(commitId) {
      return this.db.prepare(
        'SELECT * FROM violations WHERE commit_id = ?'
      ).all(commitId);
    }

    getAllViolations(limit = 200) {
      return this.db.prepare(
        `SELECT v.*, c.commit_hash, c.author, c.timestamp
         FROM violations v
         JOIN commits c ON v.commit_id = c.id
         ORDER BY c.timestamp DESC
         LIMIT ?`
      ).all(limit);
    }

    getStats() {
      const totalCommits = this.db.prepare('SELECT COUNT(*) as count FROM commits').get().count;
      const bypassedCommits = this.db.prepare('SELECT COUNT(*) as count FROM commits WHERE bypassed = 1').get().count;
      const totalViolations = this.db.prepare('SELECT COUNT(*) as count FROM violations').get().count;
      const topRules = this.db.prepare(
        `SELECT rule_id, COUNT(*) as count FROM violations
         GROUP BY rule_id ORDER BY count DESC LIMIT 10`
      ).all();

      return { totalCommits, bypassedCommits, totalViolations, topRules };
    }

    close() {
      this.db.close();
    }
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**
  Run: `node --test tests/dashboard/db.test.js`
  Expected: All 5 tests PASS

- [ ] **Step 5: Commit**
  ```bash
  git add src/dashboard/db.js tests/dashboard/db.test.js
  git commit -m "feat: SQLite database adapter with schema migration"
  ```

---

### Task 5.2: Dashboard API Routes — `src/dashboard/routes/api.js`

**Files:**
- Create: `src/dashboard/routes/api.js`

- [ ] **Step 1: Write the implementation**

  `src/dashboard/routes/api.js`:
  ```javascript
  import { Router } from 'express';
  import { v4 as uuidv4 } from 'uuid';

  /**
   * Create API routes.
   * All /api/* routes require DASHBOARD_KEY in Authorization header.
   */
  export function createApiRoutes(db) {
    const router = Router();

    // Auth middleware for API routes
    router.use((req, res, next) => {
      const key = process.env.DASHBOARD_KEY;
      if (!key) {
        return res.status(500).json({ error: 'DASHBOARD_KEY not configured on server' });
      }
      const provided = req.headers.authorization?.replace('Bearer ', '');
      if (provided !== key) {
        return res.status(401).json({ error: 'Invalid or missing authorization key' });
      }
      next();
    });

    // POST /api/commits — receive commit data from CLI
    router.post('/commits', (req, res) => {
      const { commit_hash, author, timestamp, result, bypassed, files } = req.body;

      if (!commit_hash || !author || !timestamp) {
        return res.status(400).json({ error: 'Missing required fields: commit_hash, author, timestamp' });
      }

      const commitId = uuidv4();
      db.insertCommit({
        id: commitId,
        commit_hash,
        author,
        timestamp,
        bypassed: bypassed ? 1 : 0,
      });

      // Insert violations if any
      if (files && Array.isArray(files)) {
        for (const file of files) {
          for (const ruleId of (file.rule_ids || [])) {
            db.insertViolation({
              id: uuidv4(),
              commit_id: commitId,
              file_name: file.file_name || null,
              file_hash: file.file_hash || null,
              rule_id: ruleId,
            });
          }
        }
      }

      res.status(201).json({ id: commitId });
    });

    // GET /api/commits — list recent commits
    router.get('/commits', (req, res) => {
      const limit = parseInt(req.query.limit || '100', 10);
      const commits = db.getAllCommits(limit);
      res.json(commits);
    });

    // GET /api/violations — list recent violations
    router.get('/violations', (req, res) => {
      const limit = parseInt(req.query.limit || '200', 10);
      const violations = db.getAllViolations(limit);
      res.json(violations);
    });

    // GET /api/stats — summary statistics
    router.get('/stats', (req, res) => {
      const stats = db.getStats();
      res.json(stats);
    });

    return router;
  }
  ```

- [ ] **Step 2: Commit**
  ```bash
  git add src/dashboard/routes/api.js
  git commit -m "feat: dashboard REST API routes with auth middleware"
  ```

---

### Task 5.3: Dashboard Page Routes — `src/dashboard/routes/pages.js`

**Files:**
- Create: `src/dashboard/routes/pages.js`

- [ ] **Step 1: Write the implementation**

  `src/dashboard/routes/pages.js`:
  ```javascript
  import { Router } from 'express';
  import { join, dirname } from 'node:path';
  import { fileURLToPath } from 'node:url';

  const __dirname = dirname(fileURLToPath(import.meta.url));

  export function createPageRoutes() {
    const router = Router();

    // Public demo page — no auth
    router.get('/demo', (req, res) => {
      res.sendFile(join(__dirname, '..', 'public', 'demo.html'));
    });

    // Protected dashboard — checks key via query param or cookie
    router.get('/dashboard', (req, res) => {
      const key = process.env.DASHBOARD_KEY;
      const provided = req.query.key || req.headers['x-dashboard-key'];

      if (!key || provided !== key) {
        return res.status(401).send(
          '<h1>Unauthorized</h1><p>Provide ?key=YOUR_DASHBOARD_KEY in the URL.</p>'
        );
      }

      res.sendFile(join(__dirname, '..', 'public', 'dashboard.html'));
    });

    return router;
  }
  ```

- [ ] **Step 2: Commit**
  ```bash
  git add src/dashboard/routes/pages.js
  git commit -m "feat: dashboard page routes with auth"
  ```

---

### Task 5.4: Dashboard Public Pages — `demo.html` and `dashboard.html`

**Files:**
- Create: `src/dashboard/public/demo.html`
- Create: `src/dashboard/public/dashboard.html`

- [ ] **Step 1: Create demo.html**

  `src/dashboard/public/demo.html`:
  ```html
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Guardrails — Demo Dashboard</title>
    <style>
      :root {
        --bg: #0f1117;
        --surface: #1a1d27;
        --border: #2a2d3a;
        --text: #e1e4ed;
        --text-muted: #8b8fa3;
        --accent: #6366f1;
        --accent-soft: rgba(99,102,241,0.15);
        --green: #22c55e;
        --green-soft: rgba(34,197,94,0.15);
        --red: #ef4444;
        --red-soft: rgba(239,68,68,0.15);
        --amber: #f59e0b;
        --amber-soft: rgba(245,158,11,0.15);
        --radius: 8px;
        --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      }
      * { margin:0; padding:0; box-sizing:border-box; }
      body { background:var(--bg); color:var(--text); font-family:var(--font); padding:2rem; }
      .container { max-width:1000px; margin:0 auto; }
      header { margin-bottom:2rem; }
      header h1 { font-size:1.5rem; font-weight:600; display:flex; align-items:center; gap:0.5rem; }
      header h1 span { color:var(--accent); }
      header p { color:var(--text-muted); margin-top:0.25rem; font-size:0.875rem; }
      .badge { display:inline-block; font-size:0.7rem; font-weight:600; padding:2px 8px;
               border-radius:9999px; text-transform:uppercase; letter-spacing:0.03em; }
      .badge-demo { background:var(--amber-soft); color:var(--amber); }
      .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:1rem; margin-bottom:2rem; }
      .stat-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:1.25rem; }
      .stat-card .label { font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; }
      .stat-card .value { font-size:2rem; font-weight:700; margin-top:0.25rem; }
      .stat-card .value.green { color:var(--green); }
      .stat-card .value.red { color:var(--red); }
      .stat-card .value.amber { color:var(--amber); }
      table { width:100%; border-collapse:collapse; background:var(--surface);
              border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; }
      thead th { text-align:left; padding:0.75rem 1rem; font-size:0.75rem; color:var(--text-muted);
                 text-transform:uppercase; letter-spacing:0.05em; border-bottom:1px solid var(--border); }
      tbody td { padding:0.75rem 1rem; font-size:0.875rem; border-bottom:1px solid var(--border); }
      tbody tr:last-child td { border-bottom:none; }
      tbody tr:hover { background:rgba(99,102,241,0.04); }
      .hash { font-family:'SF Mono',SFMono-Regular,Consolas,monospace; color:var(--accent); font-size:0.8rem; }
      .status-pass { color:var(--green); font-weight:600; }
      .status-fail { color:var(--red); font-weight:600; }
      .status-bypass { color:var(--amber); font-weight:600; }
      .section-title { font-size:0.875rem; font-weight:600; margin-bottom:0.75rem; color:var(--text-muted); }
      .top-rules { margin-top:2rem; }
      .rule-bar { display:flex; align-items:center; gap:0.75rem; padding:0.5rem 0; }
      .rule-bar .name { font-size:0.8rem; font-family:monospace; min-width:180px; }
      .rule-bar .bar { height:6px; border-radius:3px; background:var(--accent); }
      .rule-bar .count { font-size:0.75rem; color:var(--text-muted); }
    </style>
  </head>
  <body>
    <div class="container">
      <header>
        <h1>🛡️ <span>Guardrails</span> Dashboard <span class="badge badge-demo">Demo Data</span></h1>
        <p>This page shows seeded fixture data for demonstration purposes.</p>
      </header>

      <div class="stats" id="stats"></div>

      <p class="section-title">Recent Commits</p>
      <table>
        <thead><tr><th>Commit</th><th>Author</th><th>Date</th><th>Status</th><th>Violations</th></tr></thead>
        <tbody id="commits-table"></tbody>
      </table>

      <div class="top-rules" id="top-rules-section">
        <p class="section-title" style="margin-top:2rem;">Top Violated Rules</p>
        <div id="top-rules"></div>
      </div>
    </div>

    <script>
      // Seeded fixture data
      const DEMO_COMMITS = [
        { hash:'a1b2c3d4', author:'alice@acme.com', timestamp:'2025-06-15T14:30:00Z', status:'fail', violations:['no-raw-sql'], bypassed:false },
        { hash:'e5f6a7b8', author:'bob@acme.com',   timestamp:'2025-06-15T13:15:00Z', status:'pass', violations:[], bypassed:false },
        { hash:'c9d0e1f2', author:'carol@acme.com', timestamp:'2025-06-15T12:00:00Z', status:'fail', violations:['no-hardcoded-secrets','no-console-log'], bypassed:false },
        { hash:'34a5b6c7', author:'alice@acme.com', timestamp:'2025-06-14T17:45:00Z', status:'pass', violations:[], bypassed:false },
        { hash:'d8e9f0a1', author:'dave@acme.com',  timestamp:'2025-06-14T16:30:00Z', status:'bypass', violations:[], bypassed:true },
        { hash:'b2c3d4e5', author:'bob@acme.com',   timestamp:'2025-06-14T15:10:00Z', status:'pass', violations:[], bypassed:false },
        { hash:'f6a7b8c9', author:'carol@acme.com', timestamp:'2025-06-14T11:20:00Z', status:'fail', violations:['no-todo-comments'], bypassed:false },
        { hash:'0e1f2a3b', author:'alice@acme.com', timestamp:'2025-06-13T09:00:00Z', status:'pass', violations:[], bypassed:false },
      ];

      const totalCommits = DEMO_COMMITS.length;
      const totalViolations = DEMO_COMMITS.reduce((s,c) => s+c.violations.length, 0);
      const bypassCount = DEMO_COMMITS.filter(c => c.bypassed).length;
      const bypassRate = Math.round((bypassCount/totalCommits)*100);

      document.getElementById('stats').innerHTML = `
        <div class="stat-card"><div class="label">Total Commits</div><div class="value">${totalCommits}</div></div>
        <div class="stat-card"><div class="label">Violations</div><div class="value red">${totalViolations}</div></div>
        <div class="stat-card"><div class="label">Bypassed</div><div class="value amber">${bypassCount}</div></div>
        <div class="stat-card"><div class="label">Bypass Rate</div><div class="value ${bypassRate>0?'amber':'green'}">${bypassRate}%</div></div>
      `;

      const tbody = document.getElementById('commits-table');
      for (const c of DEMO_COMMITS) {
        const statusClass = c.bypassed ? 'status-bypass' : c.status==='pass' ? 'status-pass' : 'status-fail';
        const statusLabel = c.bypassed ? 'BYPASSED' : c.status.toUpperCase();
        const viols = c.violations.length > 0 ? c.violations.map(v=>`<span class="badge" style="background:var(--red-soft);color:var(--red)">${v}</span>`).join(' ') : '—';
        const date = new Date(c.timestamp).toLocaleDateString('en-US', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
        tbody.innerHTML += `<tr><td class="hash">${c.hash}</td><td>${c.author}</td><td style="color:var(--text-muted)">${date}</td><td class="${statusClass}">${statusLabel}</td><td>${viols}</td></tr>`;
      }

      // Top rules
      const ruleCounts = {};
      for (const c of DEMO_COMMITS) for (const v of c.violations) ruleCounts[v] = (ruleCounts[v]||0)+1;
      const sorted = Object.entries(ruleCounts).sort((a,b)=>b[1]-a[1]);
      const maxCount = sorted.length > 0 ? sorted[0][1] : 1;
      const rulesDiv = document.getElementById('top-rules');
      for (const [rule, count] of sorted) {
        rulesDiv.innerHTML += `<div class="rule-bar"><span class="name">${rule}</span><div class="bar" style="width:${(count/maxCount)*200}px"></div><span class="count">${count}</span></div>`;
      }
    </script>
  </body>
  </html>
  ```

- [ ] **Step 2: Create dashboard.html**

  `src/dashboard/public/dashboard.html`:
  ```html
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Guardrails — Dashboard</title>
    <style>
      :root {
        --bg: #0f1117;
        --surface: #1a1d27;
        --border: #2a2d3a;
        --text: #e1e4ed;
        --text-muted: #8b8fa3;
        --accent: #6366f1;
        --accent-soft: rgba(99,102,241,0.15);
        --green: #22c55e;
        --green-soft: rgba(34,197,94,0.15);
        --red: #ef4444;
        --red-soft: rgba(239,68,68,0.15);
        --amber: #f59e0b;
        --amber-soft: rgba(245,158,11,0.15);
        --radius: 8px;
        --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      }
      * { margin:0; padding:0; box-sizing:border-box; }
      body { background:var(--bg); color:var(--text); font-family:var(--font); padding:2rem; }
      .container { max-width:1000px; margin:0 auto; }
      header { margin-bottom:2rem; }
      header h1 { font-size:1.5rem; font-weight:600; display:flex; align-items:center; gap:0.5rem; }
      header h1 span { color:var(--accent); }
      header p { color:var(--text-muted); margin-top:0.25rem; font-size:0.875rem; }
      .badge { display:inline-block; font-size:0.7rem; font-weight:600; padding:2px 8px;
               border-radius:9999px; text-transform:uppercase; letter-spacing:0.03em; }
      .badge-live { background:var(--green-soft); color:var(--green); }
      .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:1rem; margin-bottom:2rem; }
      .stat-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:1.25rem; }
      .stat-card .label { font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; }
      .stat-card .value { font-size:2rem; font-weight:700; margin-top:0.25rem; }
      .stat-card .value.green { color:var(--green); }
      .stat-card .value.red { color:var(--red); }
      .stat-card .value.amber { color:var(--amber); }
      table { width:100%; border-collapse:collapse; background:var(--surface);
              border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; }
      thead th { text-align:left; padding:0.75rem 1rem; font-size:0.75rem; color:var(--text-muted);
                 text-transform:uppercase; letter-spacing:0.05em; border-bottom:1px solid var(--border); }
      tbody td { padding:0.75rem 1rem; font-size:0.875rem; border-bottom:1px solid var(--border); }
      tbody tr:last-child td { border-bottom:none; }
      tbody tr:hover { background:rgba(99,102,241,0.04); }
      .hash { font-family:'SF Mono',SFMono-Regular,Consolas,monospace; color:var(--accent); font-size:0.8rem; }
      .status-pass { color:var(--green); font-weight:600; }
      .status-fail { color:var(--red); font-weight:600; }
      .status-bypass { color:var(--amber); font-weight:600; }
      .section-title { font-size:0.875rem; font-weight:600; margin-bottom:0.75rem; color:var(--text-muted); }
      .top-rules { margin-top:2rem; }
      .rule-bar { display:flex; align-items:center; gap:0.75rem; padding:0.5rem 0; }
      .rule-bar .name { font-size:0.8rem; font-family:monospace; min-width:180px; }
      .rule-bar .bar { height:6px; border-radius:3px; background:var(--accent); }
      .rule-bar .count { font-size:0.75rem; color:var(--text-muted); }
      .refresh-info { font-size:0.75rem; color:var(--text-muted); margin-top:0.5rem; }
      .error-msg { background:var(--red-soft); color:var(--red); padding:1rem; border-radius:var(--radius);
                   margin-bottom:1rem; display:none; }
      .loading { color:var(--text-muted); text-align:center; padding:2rem; }
    </style>
  </head>
  <body>
    <div class="container">
      <header>
        <h1>🛡️ <span>Guardrails</span> Dashboard <span class="badge badge-live">Live</span></h1>
        <p>Real violation data from your team's commits.</p>
        <p class="refresh-info">Auto-refreshes every 30 seconds.</p>
      </header>

      <div class="error-msg" id="error"></div>

      <div class="stats" id="stats"><div class="loading">Loading stats...</div></div>

      <p class="section-title">Recent Commits</p>
      <table>
        <thead><tr><th>Commit</th><th>Author</th><th>Date</th><th>Status</th></tr></thead>
        <tbody id="commits-table"><tr><td colspan="4" class="loading">Loading...</td></tr></tbody>
      </table>

      <div class="top-rules">
        <p class="section-title" style="margin-top:2rem;">Top Violated Rules</p>
        <div id="top-rules"><div class="loading">Loading...</div></div>
      </div>
    </div>

    <script>
      // Extract the dashboard key from the URL query parameter
      const params = new URLSearchParams(window.location.search);
      const KEY = params.get('key') || '';

      const headers = {
        'Authorization': `Bearer ${KEY}`,
        'Content-Type': 'application/json',
      };

      function showError(msg) {
        const el = document.getElementById('error');
        el.textContent = msg;
        el.style.display = 'block';
      }

      async function fetchData() {
        try {
          const [statsRes, commitsRes, violationsRes] = await Promise.all([
            fetch('/api/stats', { headers }),
            fetch('/api/commits?limit=50', { headers }),
            fetch('/api/violations?limit=200', { headers }),
          ]);

          if (!statsRes.ok) { showError(`API error: ${statsRes.status}`); return; }
          document.getElementById('error').style.display = 'none';

          const stats = await statsRes.json();
          const commits = await commitsRes.json();
          const violations = await violationsRes.json();

          renderStats(stats);
          renderCommits(commits, violations);
          renderTopRules(stats.topRules || []);
        } catch (e) {
          showError(`Failed to fetch data: ${e.message}`);
        }
      }

      function renderStats(stats) {
        const bypassRate = stats.totalCommits > 0
          ? Math.round((stats.bypassedCommits / stats.totalCommits) * 100)
          : 0;
        document.getElementById('stats').innerHTML = `
          <div class="stat-card"><div class="label">Total Commits</div><div class="value">${stats.totalCommits}</div></div>
          <div class="stat-card"><div class="label">Violations</div><div class="value red">${stats.totalViolations}</div></div>
          <div class="stat-card"><div class="label">Bypassed</div><div class="value amber">${stats.bypassedCommits}</div></div>
          <div class="stat-card"><div class="label">Bypass Rate</div><div class="value ${bypassRate>0?'amber':'green'}">${bypassRate}%</div></div>
        `;
      }

      function renderCommits(commits, violations) {
        const tbody = document.getElementById('commits-table');
        if (commits.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" style="color:var(--text-muted);text-align:center;padding:2rem;">No commits recorded yet.</td></tr>';
          return;
        }

        // Build a lookup: commit_id -> violation count
        const violByCommit = {};
        for (const v of violations) {
          violByCommit[v.commit_id] = (violByCommit[v.commit_id] || 0) + 1;
        }

        tbody.innerHTML = '';
        for (const c of commits) {
          const isBypassed = c.bypassed === 1;
          const violCount = violByCommit[c.id] || 0;
          const statusClass = isBypassed ? 'status-bypass' : violCount > 0 ? 'status-fail' : 'status-pass';
          const statusLabel = isBypassed ? 'BYPASSED' : violCount > 0 ? `FAIL (${violCount})` : 'PASS';
          const shortHash = c.commit_hash.substring(0, 8);
          const date = new Date(c.timestamp).toLocaleDateString('en-US', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
          tbody.innerHTML += `<tr>
            <td class="hash">${shortHash}</td>
            <td>${c.author}</td>
            <td style="color:var(--text-muted)">${date}</td>
            <td class="${statusClass}">${statusLabel}</td>
          </tr>`;
        }
      }

      function renderTopRules(topRules) {
        const container = document.getElementById('top-rules');
        if (topRules.length === 0) {
          container.innerHTML = '<div style="color:var(--text-muted);font-size:0.875rem;">No violations recorded yet.</div>';
          return;
        }
        const maxCount = topRules[0].count;
        container.innerHTML = '';
        for (const { rule_id, count } of topRules) {
          container.innerHTML += `<div class="rule-bar">
            <span class="name">${rule_id}</span>
            <div class="bar" style="width:${(count/maxCount)*200}px"></div>
            <span class="count">${count}</span>
          </div>`;
        }
      }

      // Initial load + auto-refresh
      fetchData();
      setInterval(fetchData, 30000);
    </script>
  </body>
  </html>
  ```

> [!NOTE]
> Both HTML files are fully self-contained (inline CSS + JS, no external dependencies). This keeps the dashboard zero-build and zero-dependency — `npm start` and it works.

- [ ] **Step 3: Commit**
  ```bash
  git add src/dashboard/public/
  git commit -m "feat: dashboard demo and live HTML pages"
  ```

---

### Task 5.5: Dashboard Server — `src/dashboard/server.js`

**Files:**
- Create: `src/dashboard/server.js`

- [ ] **Step 1: Write the implementation**

  `src/dashboard/server.js`:
  ```javascript
  import express from 'express';
  import { mkdirSync, existsSync } from 'node:fs';
  import { DashboardDB } from './db.js';
  import { createApiRoutes } from './routes/api.js';
  import { createPageRoutes } from './routes/pages.js';

  const PORT = process.env.PORT || 3000;
  const DATA_DIR = process.env.DATA_DIR || './data';
  const DB_PATH = `${DATA_DIR}/guardrails.db`;

  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new DashboardDB(DB_PATH);
  const app = express();

  app.use(express.json());

  // Routes
  app.use('/api', createApiRoutes(db));
  app.use('/', createPageRoutes());

  // Root redirect
  app.get('/', (req, res) => {
    res.redirect('/demo');
  });

  app.listen(PORT, () => {
    console.log(`\n🛡️  Guardrails Dashboard running at http://localhost:${PORT}`);
    console.log(`   Demo:      http://localhost:${PORT}/demo`);
    console.log(`   Dashboard: http://localhost:${PORT}/dashboard?key=YOUR_KEY\n`);
  });

  export { app, db };
  ```

- [ ] **Step 2: Verify the server starts**
  Run: `cd c:\warlock\guardrails && DASHBOARD_KEY=test-key node src/dashboard/server.js`
  Expected: "Guardrails Dashboard running at http://localhost:3000"

- [ ] **Step 3: Commit**
  ```bash
  git add src/dashboard/server.js
  git commit -m "feat: Express dashboard server"
  ```

---

### Task 5.6: Docker Setup

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: Create Dockerfile**

  `Dockerfile`:
  ```dockerfile
  FROM node:20-slim

  WORKDIR /app

  COPY package*.json ./
  RUN npm ci --production

  COPY src/dashboard/ ./src/dashboard/

  ENV PORT=3000
  ENV DATA_DIR=/app/data

  EXPOSE 3000

  CMD ["node", "src/dashboard/server.js"]
  ```

- [ ] **Step 2: Create docker-compose.yml**

  `docker-compose.yml`:
  ```yaml
  version: '3.8'

  services:
    dashboard:
      build: .
      ports:
        - "3000:3000"
      environment:
        - DASHBOARD_KEY=${DASHBOARD_KEY}
      volumes:
        - guardrails-data:/app/data

  volumes:
    guardrails-data:
  ```

- [ ] **Step 3: Commit**
  ```bash
  git add Dockerfile docker-compose.yml
  git commit -m "feat: Docker setup for dashboard"
  ```

---

## Phase 6: Templates

### Task 6.1: Create all template rule files

**Files:**
- Create: `templates/generic.guardrails.md`
- Create: `templates/node.guardrails.md`
- Create: `templates/react.guardrails.md`
- Create: `templates/python.guardrails.md`
- Create: `templates/go.guardrails.md`

- [ ] **Step 1: Create generic template**

  `templates/generic.guardrails.md`:
  ```markdown
  # .guardrails.md — Generic (language-agnostic)

  ## Static Rules
  # [static:no-todo-comments]  Do not commit code with TODO or FIXME comments.
  # [static:no-debug-flag]     Never set debug: true in committed code.
  # [static:no-http-urls]      Never hardcode http:// URLs (use environment variables).

  ## LLM Rules
  # [llm] Never hardcode secrets, API keys, or passwords.
  #        These must come from environment variables.
  # [llm] Never commit commented-out code blocks. Remove dead code instead.
  ```

- [ ] **Step 2: Create Node.js template**

  `templates/node.guardrails.md`:
  ```markdown
  # .guardrails.md — Node.js

  ## Static Rules
  # [static:no-todo-comments]  Do not commit code with TODO or FIXME comments.
  # [static:no-console-log]    Never use console.log — use the structured logger.
  # [static:no-debug-flag]     Never set debug: true in committed code.
  # [static:no-http-urls]      Never hardcode http:// URLs (use environment variables).

  ## LLM Rules
  # [llm] Never construct SQL queries by concatenating variables.
  #        Use parameterized queries or a query builder.
  # [llm] Never hardcode secrets, API keys, or passwords.
  #        These must come from environment variables.
  # [llm] Never call eval() with user-controlled input.
  # [llm] Always use async/await instead of raw Promises with .then() chains.
  # [llm] Always handle errors in async functions with try/catch or .catch().
  ```

- [ ] **Step 3: Create React template**

  `templates/react.guardrails.md`:
  ```markdown
  # .guardrails.md — React

  ## Static Rules
  # [static:no-todo-comments]  Do not commit code with TODO or FIXME comments.
  # [static:no-console-log]    Never use console.log — use the structured logger.
  # [static:no-debug-flag]     Never set debug: true in committed code.

  ## LLM Rules
  # [llm] Never hardcode secrets, API keys, or passwords.
  #        These must come from environment variables.
  # [llm] Always provide a unique key prop when rendering lists with .map().
  # [llm] Always include a dependency array in useEffect calls.
  #        Missing dependencies cause infinite re-renders.
  # [llm] Never use dangerouslySetInnerHTML with user-provided content.
  # [llm] Always add alt attributes to img elements for accessibility.
  ```

- [ ] **Step 4: Create Python template**

  `templates/python.guardrails.md`:
  ```markdown
  # .guardrails.md — Python

  ## Static Rules
  # [static:no-todo-comments]  Do not commit code with TODO or FIXME comments.
  # [static:no-debug-flag]     Never set debug: true in committed code.
  # [static:no-http-urls]      Never hardcode http:// URLs (use environment variables).

  ## LLM Rules
  # [llm] Never construct SQL queries by string formatting or concatenation.
  #        Use parameterized queries with %s or ? placeholders.
  # [llm] Never hardcode secrets, API keys, or passwords.
  #        These must come from environment variables via os.environ.
  # [llm] Never use bare except clauses. Always catch specific exception types.
  # [llm] Always add type hints to function parameters and return values.
  ```

- [ ] **Step 5: Create Go template**

  `templates/go.guardrails.md`:
  ```markdown
  # .guardrails.md — Go

  ## Static Rules
  # [static:no-todo-comments]  Do not commit code with TODO or FIXME comments.
  # [static:no-debug-flag]     Never set debug: true in committed code.
  # [static:no-http-urls]      Never hardcode http:// URLs (use environment variables).

  ## LLM Rules
  # [llm] Never ignore error return values. Every error must be checked.
  # [llm] Never hardcode secrets, API keys, or passwords.
  #        These must come from environment variables via os.Getenv.
  # [llm] Always propagate context.Context as the first parameter.
  # [llm] Never launch goroutines without a mechanism to shut them down.
  #        Use context cancellation or a done channel.
  ```

- [ ] **Step 6: Commit**
  ```bash
  git add templates/
  git commit -m "feat: rule templates for Node, React, Python, Go, and generic"
  ```

---

## Phase 7: Final Wiring and Polish

### Task 7.1: Complete `src/cli.js` with all commands

**Files:**
- Modify: `src/cli.js`

- [ ] **Step 1: Write the final CLI with all commands registered**

  `src/cli.js`:
  ```javascript
  import { Command } from 'commander';
  import { install } from './commands/install.js';
  import { doctor } from './commands/doctor.js';
  import { init } from './commands/init.js';
  import { validate } from './commands/validate.js';
  import { benchmark } from './commands/benchmark.js';
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
      .action(async () => {
        const exitCode = await runPipeline();
        process.exit(exitCode);
      });

    return program;
  }
  ```

- [ ] **Step 2: Verify all commands are registered**
  Run: `node bin/guardrails.js --help`
  Expected: Lists all 6 commands: install, doctor, init, validate, benchmark, review

- [ ] **Step 3: Commit**
  ```bash
  git add src/cli.js
  git commit -m "feat: complete CLI with all commands registered"
  ```

---

### Task 7.2: Create `.gitignore`

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Write .gitignore**
  ```
  node_modules/
  data/
  .guardrails/
  *.db
  ```

- [ ] **Step 2: Commit**
  ```bash
  git add .gitignore
  git commit -m "chore: add .gitignore"
  ```

---

## Verification Plan

### Automated Tests

```bash
# Run all unit tests
node --test tests/core/*.test.js tests/commands/*.test.js tests/dashboard/*.test.js

# Run core module tests only
node --test tests/core/*.test.js

# Expected: All tests pass (6 test files, ~40+ assertions)
```

### Manual Verification

Each command manually tested in sequence:

| Step | Command | Expected result |
|------|---------|----------------|
| 1 | `node bin/guardrails.js --help` | All 6 commands listed |
| 2 | `node bin/guardrails.js doctor` | Shows environment check results |
| 3 | `node bin/guardrails.js init` | Interactive model + template selection |
| 4 | `node bin/guardrails.js install` | Pre-commit hook written to `.git/hooks/` |
| 5 | `node bin/guardrails.js benchmark` | Latency table for installed models |
| 6 | Stage a file with `console.log`, run `git commit` | Commit blocked by static rule |
| 7 | Stage a clean file, run `git commit` | Commit allowed after LLM review |
| 8 | `node src/dashboard/server.js` | Dashboard at localhost:3000 |
| 9 | Visit `http://localhost:3000/demo` | Demo page with seeded data |

### Integration Smoke Test

```bash
# In a test git repo:
cd /tmp/test-repo && git init
cp path/to/guardrails/templates/node.guardrails.md .guardrails.md
echo 'model: qwen2.5-coder:1.5b' >> .guardrails.md

# Stage a file with a violation
echo 'console.log("test");' > test.js
git add test.js

# Run the pipeline directly
node path/to/guardrails/bin/guardrails.js review
# Expected: Blocked by [static:no-console-log]
```
