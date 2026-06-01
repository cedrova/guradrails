# GUARDRAILS — Engineering Design Document v3.0

*Local-first, privacy-preserving code review via git pre-commit hooks*

> **v3.0 changelog:** All five open questions from v2 Section I have been resolved.
> Bypass detection strategy replaced. Token thresholds clarified. Model selection
> flow redesigned. Self-hosting scope narrowed. AST rules renamed and scoped.
> See Section I for the full decision log.

---

# A — System Architecture

## What Guardrails Is

Guardrails installs as a git pre-commit hook. Every time a developer runs `git commit`,
it intercepts the commit, extracts the diff, loads the team's rules, sends structured
prompts to a locally-running Ollama model, parses the JSON response, and either allows
the commit or blocks it with specific, actionable violation messages. Nothing leaves the
developer's machine unless the dashboard integration is explicitly enabled.

## Component Flow

Every commit passes through this pipeline in sequence:

```
git commit
    │
    v
[Pre-commit Hook]        Installed by: guardrails install
    │                    Calls the Guardrails CLI binary
    v
[Bypass Reconciler]      Compares commits table vs git log (10-commit window)
    │                    Marks any gap as bypassed = 1 in the DB
    │                    Runs BEFORE the current review
    v
[Diff Extractor]         git diff --cached — staged changes only
    │                    Estimates tokens via chars/4
    │                    Warn threshold: 1500 tokens (~100 lines)
    │                    Hard cap: 3000 tokens (~200 lines) — splits by file
    v
[Rule Loader]            Walks directory tree upward from changed file
    │                    Resolves nearest .guardrails.md (monorepo-ready)
    │                    Splits rules: STATIC_RULES vs LLM_RULES
    v
[Static Rule Runner]     Deterministic checks run first (fast, zero LLM cost)
    │                    Examples: TODO comments, console.log, debug flags
    │                    Plugin slot available for v2 language-specific AST
    v
[Prompt Builder]         Constructs structured prompt with LLM_RULES + diff
    │                    Instructs model to return strict JSON only
    v
[Ollama]                 Local inference — code never leaves the machine
    │                    Streaming output piped to stdout in real time
    │                    20-second timeout with fail-open behaviour
    v
[Response Parser]        Parses and validates JSON strictly
    │                    Rejects malformed responses — no regex fallback
    v
[Cache Layer]            hash(diff) -> result stored in ~/.guardrails/cache
    │                    Unchanged files reuse previous review
    v
[Violation Reporter]     Formats violations for terminal output
    │
    +--[PASS]--> Commit allowed
    │
    +--[FAIL]--> Commit blocked, violations printed
    │
    v  (if dashboard_url is set in config)
[Telemetry Interface]    Abstraction layer: Local | Dashboard | (future: Cloud)
    │                    Sends metadata only — never code, never violation detail
    v
[Dashboard API]          Optional. Receives: file name, rule_id, timestamp, author
```

## Repository Structure

```
guardrails/
  bin/
    guardrails              Entry point CLI
  src/
    commands/
      doctor.js             Environment health checks
      install.js            Git hook installer
      init.js               Project scaffolding + model selection
      validate.js           Rule testing against sample diffs
      benchmark.js          Model speed benchmarking
    core/
      diff.js               Diff extraction + token estimation
      rule-loader.js        Rule file resolution + static/LLM split
      static-runner.js      Deterministic rule execution + plugin slot
      prompt-builder.js     LLM prompt construction
      ollama-client.js      Ollama HTTP client + timeout + streaming
      response-parser.js    JSON validation + violation extraction
      cache.js              Diff hash -> result caching
      telemetry.js          Telemetry interface + adapters
      bypass.js             Bypass reconciliation (git log vs commits table)
    dashboard/
      server.js             Express API server
      db.js                 SQLite adapter
      routes/               REST endpoints
      public/
        demo.html           Seeded public demo page
        dashboard.html      Secret-key protected dashboard
  templates/
    node.guardrails.md
    react.guardrails.md
    python.guardrails.md
    go.guardrails.md
    generic.guardrails.md
```

---

# B — The Rule System

## The Most Important Design Decision: Static vs LLM

Not all rules should be checked by the LLM. This is the single most consequential
design decision in the entire project. Sending a rule like "no function should exceed
50 lines" to an LLM is slow, expensive, and non-deterministic. A static text check
answers simpler questions in milliseconds with 100% reliability.

The rule-loader splits every rule into one of two categories before any processing begins:

| Rule Type | Checked by | Examples | Characteristics |
|-----------|------------|---------|-----------------|
| Static Rule `[static]` | Text/regex matching (fast) | TODO comments, console.log, debug flags, hardcoded http:// URLs | Deterministic, binary, text-level |
| LLM Rule `[llm]` | Ollama (slower) | SQL injection patterns, hardcoded secrets, security architecture, API design smell | Requires reasoning about intent, not just syntax |

**Why deterministic checks run first:** If static rules block the commit, the LLM is
never called. This means obvious violations get instant feedback. Clean commits with
only LLM-type rules still incur the full latency cost — which is why model selection
and caching matter (see Section D).

## Rule File Format

Rules in `.guardrails.md` are tagged with their type. The rule-loader uses this tag
to route them.

**Static rules require an explicit ID** in the tag — `[static:rule-id]`. The ID is
the hard binding to a built-in checker. The rule text after the tag is human-readable
description only; it plays no role in matching. This is a deliberate security decision:
pattern-matching against free-form text creates an injection surface where crafted rule
descriptions could accidentally trigger unintended checkers. Explicit IDs have no such
ambiguity — one ID maps to exactly one checker.

**LLM rules use a bare `[llm]` tag** — no ID needed. The full rule text is sent
verbatim to the model as an instruction. The text *is* the rule.

```markdown
# .guardrails.md

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
```

**Valid static IDs in v1** (unknown IDs are skipped with a warning, never silently
passed or failed):

| ID | What it checks |
|----|---------------|
| `no-todo-comments` | TODO or FIXME in any comment |
| `no-console-log` | console.log anywhere in the diff |
| `no-debug-flag` | `debug: true` anywhere in the diff |
| `no-http-urls` | hardcoded `http://` URLs (localhost excluded) |
| `no-banned-import` | import of a banned package (requires `banned:` config — see below) |

> **Note on `[ast:rule-id]` tag:** Reserved for v2 language-specific AST plugins.
> Do not use it in v1 rule files — the runner will skip it with a warning.
> Rules requiring true AST analysis (e.g. function length) are out of v1 scope.
> See Section I, Question 5 for the reasoning.

## What Makes a Rule LLM-Checkable

An LLM rule must satisfy all three of these properties. If it fails any one of them,
it belongs in the static category or should be rewritten:

| Property | Failing example | Passing example |
|----------|----------------|----------------|
| Observable in the diff | Write clean, readable code | Never concatenate user input into SQL strings |
| Specific pattern to detect | Follow best practices | Never hardcode secrets — use environment variables |
| Binary pass/fail verdict | Write efficient code | Never call eval() with user-controlled input |

## The templates/ Directory

Ship pre-written rule files for the most common stacks. These are the starting point
for `guardrails init` and reduce the chance of developers writing vague, uncheckable
rules. All templates use only `[static:rule-id]` and `[llm]` tags — no `[ast:...]`
in v1:

```
templates/
  node.guardrails.md     async/await, SQL injection, env vars, error handling
  react.guardrails.md    prop types, key props, useEffect deps, accessibility
  python.guardrails.md   type hints, exception handling, SQL, secrets
  go.guardrails.md       error return checks, context propagation, goroutine leaks
  generic.guardrails.md  language-agnostic: secrets, TODOs, debug logs
```

## Static Rule Scope for v1

The following table defines what is and is not in scope for static rules in v1:

| Rule ID | v1 approach | Status |
|---------|------------|--------|
| `no-todo-comments` | regex on diff text | ✅ In scope |
| `no-console-log` | regex on diff text | ✅ In scope |
| `no-debug-flag` | regex on diff text | ✅ In scope |
| `no-http-urls` | regex on diff text | ✅ In scope (localhost excluded) |
| `no-banned-import` | regex on diff text, package name from config | ✅ In scope (import-level only, not transitive) |
| *(function length)* | requires true AST | ❌ v2 only — no built-in ID in v1 |
| *(import graph analysis)* | requires true AST | ❌ v2 only |
| *(cyclomatic complexity)* | requires true AST | ❌ v2 only |

## Static Runner — ID Binding and Plugin Slot

The static runner looks up checkers by **explicit rule ID** extracted from the
`[static:rule-id]` tag. The rule text is never used for matching — only the ID is.
This means there is zero ambiguity about which checker runs for which rule, and a
crafted rule description cannot accidentally trigger an unintended checker.

The rule-loader parses tags with this exact regex:
```
/^\s*#\s*\[(static|llm|ast):?([\w-]*)\]/
```

For `[static:no-console-log]` this yields `{ type: 'static', id: 'no-console-log' }`.
For `[llm]` this yields `{ type: 'llm', id: '' }` — ID is unused for LLM rules.
For `[static]` with no ID — **rejected at parse time** with an error message telling
the user to add an ID. It does not silently pass or fail.

```javascript
// src/core/static-runner.js

const BUILTIN_CHECKERS = {
  'no-console-log':    diff => /console\.log/.test(diff),
  'no-todo-comments':  diff => /\/\/\s*(TODO|FIXME)/i.test(diff),
  'no-debug-flag':     diff => /debug:\s*true/.test(diff),
  'no-http-urls':      diff => /http:\/\/(?!localhost)/.test(diff),
  'no-banned-import':  (diff, config) => {
    if (!config.banned) return false;
    const pattern = new RegExp(`import.*['"]${escapeRegex(config.banned)}['"]`);
    return pattern.test(diff);
  },
};

// v2: language-specific AST plugins register here
// Each plugin exports: { language, rules: { ruleId: (ast, config) => violations[] } }
const AST_PLUGINS = {};  // empty in v1

function runStaticChecks(diff, rules, config = {}) {
  return rules
    .filter(r => r.type === 'static')
    .flatMap(r => {
      if (!r.id) {
        // [static] with no ID — rejected at rule-loader level, never reaches here
        return [];
      }
      const checker = BUILTIN_CHECKERS[r.id] ?? AST_PLUGINS[r.language]?.[r.id];
      if (!checker) {
        // Unknown ID — skip with warning, never silently pass or fail
        console.warn(`[guardrails] Unknown static rule ID: '${r.id}' — skipping. Valid IDs: ${Object.keys(BUILTIN_CHECKERS).join(', ')}`);
        return [];
      }
      return checker(diff, config) ? [{ rule: r.id, type: 'static' }] : [];
    });
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

**Why unknown IDs warn-and-skip rather than fail-closed:** A typo in a rule ID
(`no-consol-log` instead of `no-console-log`) should not block every commit until
fixed. The warning in the terminal tells the developer immediately. Fail-closed on
an unknown ID would be a worse developer experience than the security benefit it
provides — the real security boundary is the explicit ID requirement itself.

## The guardrails validate Command

Lets developers test their rules against synthetic diffs before using them on real
commits. This catches bad rule definitions before they produce noisy or useless output:

```
$ guardrails validate --rule 'Never concatenate variables into SQL strings'

Testing rule against 3 sample diffs...

  Sample 1: Parameterized query
    db.query('SELECT * FROM users WHERE id = $1', [userId])
    Result: PASS  (correct — no violation)

  Sample 2: String concatenation
    db.query('SELECT * FROM users WHERE id = ' + userId)
    Result: FAIL  (correct — violation detected)

  Sample 3: Template literal
    db.query(`SELECT * FROM users WHERE id = ${userId}`)
    Result: FAIL  (correct — violation detected)

Rule OK. 3/3 samples evaluated correctly.
```

---

# C — Prompt Engineering and Structured Output

## Why This Section Exists

The entire product depends on what gets sent to the LLM and what comes back. A vague
prompt produces inconsistent output that is impossible to parse reliably. Structured
JSON output is non-negotiable — it is the engineering decision that separates a
prototype from a shippable tool.

## The Prompt Format

The `prompt-builder.js` module constructs this exact structure for every LLM review.
It is not configurable by the end user — the structure is fixed and tested:

```
You are a code reviewer enforcing a strict set of rules. You will be given a git diff
and a list of rules. Your job is to check whether the diff violates any rule.

Rules:
1. Never construct SQL queries by concatenating variables. Use parameterized queries.
2. Never hardcode secrets, API keys, or passwords in source code.
3. Never call eval() with user-controlled input.

Diff:
--- a/src/db/queries.js
+++ b/src/db/queries.js
@@ -12,7 +12,7 @@
+  const result = await db.query('SELECT * FROM users WHERE id = ' + userId);

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
Do not include any text outside the JSON object.
```

## Why Structured JSON — Not Free-Form Text

Without a strict JSON schema, the LLM produces output that is brittle,
model-version-sensitive, and will silently break when models are updated.
Structured JSON output solves this permanently and is parseable deterministically.

## Response Parsing — Strict, No Fallback

The `response-parser.js` module validates the JSON strictly. It does not attempt
regex fallback if JSON parsing fails. Malformed responses are treated as infrastructure
errors, not as violations, and the commit is allowed through:

```javascript
function parseResponse(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw.trim());
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

**PRINCIPLE:** A malformed LLM response is an infrastructure failure, not a code
violation. Fail open on infrastructure failures. Fail closed on rule violations.
Never confuse the two.

---

# D — Performance and Latency

## The Core Problem

A llama3 model on a mid-range laptop takes 15 to 45 seconds to review a meaningful
diff. Developers who experience this without visible feedback will bypass the hook
with `git commit --no-verify` within a week. Performance is an adoption problem,
not just an engineering preference.

There are five levers to pull, and all five must be used.

## Lever 1 — Streaming Output (Perceived Speed)

Ollama supports streaming responses. Pipe the LLM output to stdout as tokens are
generated. This makes a 20-second review feel like 8 seconds because the developer
sees progress immediately.

## Lever 2 — Model Selection (Actual Speed)

The default model matters more than any other performance decision. `qwen2.5-coder:1.5b`
is 5 to 10 times faster than llama3 for code review tasks. Model selection happens
during `guardrails init` — see Section F for the full init flow.

| Model | Size | Notes |
|-------|------|-------|
| llama3 | 4.7 GB | Too slow for a commit hook |
| qwen2.5-coder:3b | 1.9 GB | Good balance |
| qwen2.5-coder:1.5b | 1.0 GB | Recommended default |
| deepseek-coder:1.3b | 0.8 GB | Fastest, slightly less accurate |

**Note:** Latency figures are intentionally omitted from this table. Inference speed
is hardware-dependent. The `guardrails benchmark` command measures real latency on
the developer's own machine and is the authoritative source of performance data.

## Lever 3 — Token Budget and Diff Splitting

Token estimation uses character count divided by 4 — fast, no tokenizer dependency,
accurate enough for threshold decisions:

```javascript
function estimateTokens(diffText) {
  return Math.ceil(diffText.length / 4);
}
```

Two thresholds apply:

| Threshold | Token count | Approx lines | Behaviour |
|-----------|-------------|--------------|-----------|
| Warn | 1500 | ~100 lines | Print latency warning, proceed normally |
| Hard cap | 3000 | ~200 lines | Split by file, review files independently |

At the hard cap, do **not** block or skip — split by file. Each file's diff is sent
as a separate Ollama call. This keeps every prompt well within model context limits,
parallelises naturally, and aligns with the cache layer which already operates at
file granularity.

**Silent truncation is the primary correctness risk.** If a diff exceeds the model's
effective context window, the model stops reading mid-diff and reviews whatever it
received. It will not signal truncation — it will return a normal JSON response.
Violations in the truncated portion are silently missed. The hard cap and file-splitting
strategy eliminates this risk.

## Lever 4 — Diff Caching (Repeat Commits)

A developer's most common workflow after a blocked commit is: fix the specific
violation, then re-commit. In that re-commit, most files are unchanged. Caching
by diff hash means unchanged files are never re-reviewed:

```
Cache key:   SHA256(file_path + file_diff_content)
Cache store: ~/.guardrails/cache.json  (key-value, TTL: 24 hours)

Workflow:
  Commit 1: 5 files changed → review all 5 → FAIL on queries.ts
  Developer fixes queries.ts, re-commits
  Commit 2: queries.ts changed + 4 unchanged → cache hit on 4, review 1 → PASS
```

## Lever 5 — Timeout Handling

Ollama can freeze under memory pressure or thermal throttling. The timeout must
fail open:

```
Timeout: 20 seconds per file review (configurable via ollama_timeout in .guardrails.md)

If exceeded:
  1. Print: 'Guardrails: review timed out for <filename> — skipping'
  2. Allow the commit (fail open)
  3. Log: timestamp, file, model, commit hash
  4. Dashboard marks commit as 'partially reviewed'
```

## The guardrails benchmark Command

Measures real latency on the developer's hardware. Used automatically after model
pull during `guardrails init`, and available standalone:

```
$ guardrails benchmark

Benchmarking installed models (3 runs each, same sample diff)...

Model                      Avg      Min      Max
---------------------------------------------------
qwen2.5-coder:1.5b          4.2s     3.9s     4.6s   <- current default
deepseek-coder:1.3b         3.1s     2.8s     3.5s

This means commits with LLM rules will take ~4s per file on this machine.
To change model: update 'model:' in .guardrails.md
```

---

# E — Privacy

## The Core Tension

The product's core claim is: your code never leaves your machine. The optional
dashboard introduces a real tension. A violation description like "Line 42 of auth.ts
concatenates user input into a SQL query" is a description of a security vulnerability
in proprietary code. Even though the source file never left the machine, a description
of the vulnerability did.

The following rules are fixed and non-configurable:

| What is sent to the dashboard (opt-in) | What never leaves the machine (always) |
|----------------------------------------|----------------------------------------|
| File name (e.g. auth.ts) | File contents |
| Rule ID that triggered (e.g. no-raw-sql) | Code snippets from the diff |
| Timestamp | Violation detail text generated by the LLM |
| Git author email | Line numbers of specific violations |
| Pass/fail result | Any part of the prompt sent to Ollama |
| Full commit hash (stored), short hash (displayed) | Stack traces or error context |

## Why This Exact Split

The rule ID is safe to send because it is a name you defined. It tells the dashboard
which category of problem was found without revealing anything about your code. The
detail text is not safe — it describes the specific vulnerability: what the code does,
where, and why it is dangerous.

File names are borderline. Included because without them the dashboard cannot answer
"which files are most problematic this month." Line numbers are excluded because a
file name plus a line number plus a rule name together reconstitute the vulnerability
location.

## Privacy Mode: Strict

For teams that cannot accept even file names leaving their network:

```yaml
# .guardrails.md
privacy_mode: strict   # hashes filenames before sending to dashboard
                       # dashboard shows SHA256(filename) instead of filename
                       # trend analysis still works; file identification does not
```

## Secret Key — Environment Variable Only

Config files get committed. The secret key must never appear in `.guardrails.md`:

```yaml
# .guardrails.md — only the URL goes here (not sensitive)
dashboard_url: https://your-guardrails-server.com
```

```bash
# Shell — add to .bashrc or .zshrc, never commit
export GUARDRAILS_KEY=your-secret-key-here
```

If `GUARDRAILS_KEY` is not set, dashboard sync is silently skipped.

## The Telemetry Abstraction

```javascript
// src/core/telemetry.js

class TelemetryInterface {
  async send(event) { throw new Error('Not implemented'); }
}

class LocalTelemetry extends TelemetryInterface {
  async send(event) {
    // Append to ~/.guardrails/history.jsonl
  }
}

class DashboardTelemetry extends TelemetryInterface {
  async send(event) {
    // POST metadata-only payload to dashboard_url
    // Uses GUARDRAILS_KEY from environment
  }
}

function createTelemetry(config) {
  if (config.dashboard_url && process.env.GUARDRAILS_KEY) {
    return new DashboardTelemetry(config);
  }
  return new LocalTelemetry();
}
```

---

# F — Cold Start, Environment Health, and Model Selection

## Environment Failure Layers

| Layer | Failure condition | User-facing message |
|-------|------------------|---------------------|
| 1 | Ollama binary not installed | Ollama is not installed. Install it from ollama.com, then run guardrails doctor. |
| 2 | Ollama not running | Ollama is installed but not running. Start it with: ollama serve |
| 3 | Model not pulled | Model 'qwen2.5-coder:1.5b' is not downloaded. Run: ollama pull qwen2.5-coder:1.5b (~1 GB) |
| 4 | No .guardrails.md found | No .guardrails.md found in this repo. Run: guardrails init |

## The guardrails doctor Command

```
$ guardrails doctor

Checking Guardrails environment...

  [OK]   Ollama installed        (v0.3.6)
  [OK]   Ollama running          (localhost:11434)
  [FAIL] Model not found         'qwen2.5-coder:1.5b'
           Fix: ollama pull qwen2.5-coder:1.5b
           Download size: approximately 1.0 GB
           For a smaller alternative: ollama pull deepseek-coder:1.3b (~0.8 GB)

  [OK]   .guardrails.md found    (repo root)
  [OK]   Rules loaded            (3 static rules, 2 LLM rules)

1 check failed. Fix the issue above and run 'guardrails doctor' again.
```

## The guardrails init Model Selection Flow

Model selection during init follows three principles:
1. **RAM as a filter only** — hide models that exceed 60% of `os.totalmem()`
2. **Always prompt** — the developer confirms the choice, never auto-silent
3. **Benchmark after pull** — show real latency on their hardware before first use

```
$ guardrails init

Available models (your system: 16 GB RAM):

  [1] qwen2.5-coder:1.5b   ~1.0 GB   Recommended
  [2] qwen2.5-coder:3b     ~1.9 GB   More thorough
  [3] deepseek-coder:1.3b  ~0.8 GB   Fastest

Select a model [1]:
```

After selection:

```
Pulling qwen2.5-coder:1.5b... done (1.0 GB)

Running benchmark on your hardware (3 runs, sample diff)...
  Avg: 5.1s   Min: 4.8s   Max: 5.6s

This means commits with LLM rules will take ~5s per file on this machine.
Run 'guardrails benchmark' anytime to re-measure or compare models.

Writing model: qwen2.5-coder:1.5b to .guardrails.md ✓
```

**Why this matters:** Pre-written benchmark numbers from the documentation are not
meaningful on the developer's machine. The init flow sets an accurate expectation
*before* the first real commit — reducing the `--no-verify` temptation that kills
adoption.

The RAM filter logic:

```javascript
// Filter: don't show models exceeding 60% of total RAM
// Leaves headroom for OS, IDE, dev server
const safeModelSizeGB = (os.totalmem() / 1e9) * 0.6;
const availableModels = ALL_MODELS.filter(m => m.sizeGB <= safeModelSizeGB);
```

## Hook-Level Error Handling

```
Ollama not running:  Print one-line message. Allow commit. Exit 0.
Timeout exceeded:    Print one-line message. Allow commit. Log event.
JSON parse failure:  Print one-line message. Allow commit. Log raw response.
Rule violation:      Print violations. Block commit. Exit 1.

Rule: fail open on infrastructure, fail closed on violations.
```

---

# G — Bypass Detection and Audit Trail

## You Cannot Block --no-verify

`git commit --no-verify` skips all pre-commit hooks. This is a deliberate git feature.
Any attempt to prevent it will fail and breed resentment. The correct response is to
make compliance the path of least resistance and make bypasses visible to team leads.

## The Reconciliation Approach

The pre-commit hook records every reviewed commit in the `commits` table. At the
start of each subsequent pre-commit run, the bypass reconciler compares the last
N commits in `git log` against the `commits` table. Any commit present in `git log`
but absent from the table was bypassed:

```javascript
// src/core/bypass.js

async function reconcileBypasses(db, lookbackCount = 10) {
  // Get last N commits from git log
  const gitCommits = await getRecentCommits(lookbackCount);

  // Cross-reference against commits table
  const knownHashes = await db.getKnownHashes(gitCommits.map(c => c.hash));

  // Any gap = bypassed
  const bypassed = gitCommits.filter(c => !knownHashes.includes(c.hash));

  for (const commit of bypassed) {
    await db.markBypassed(commit.hash, commit.author, commit.timestamp);
  }
}
```

**Lookback window:** 10 commits. Beyond this you are doing archaeology, not monitoring.
The default is configurable via `bypass_lookback` in `.guardrails.md`.

**Why not the env var approach (v2 doc):** Environment variables are process-scoped.
Git spawns pre-commit and post-commit hooks as separate shell processes — `GUARDRAILS_RAN`
set in pre-commit does not reliably survive into post-commit across all git
configurations (worktrees, Husky, GitHub Actions). The reconciliation approach has
zero inter-process dependencies and degrades gracefully in every edge case.

**Why not git notes:** The commit object does not exist when pre-commit runs.
Git notes cannot be attached to a commit that hasn't been created yet.

## How Bypasses Appear in the Dashboard

Bypassed commits are stored with `bypassed = 1`. The dashboard renders them with
a distinct visual treatment — a bypass badge, different row colour — so team leads
see the full audit trail including unreviewed commits.

---

# H — The Dashboard

## Scope Decision: Single-Tenant First

Multi-tenancy is a completely different product. Building it in v1 is how projects
get stuck half-finished. The v1 dashboard serves exactly one team, requires no login
system, and ships a public demo page alongside the protected real dashboard.

## Why SQLite, Not PostgreSQL

| | SQLite (v1) | PostgreSQL (v2+) |
|--|-------------|-----------------|
| Installation | Zero — ships with Node | Separate install |
| Setup | npm start and it works | Init, user, connection string |
| Portfolio demo | git clone, npm start — done | Requires Postgres running alongside |
| Data scale needed | Thousands of rows | Millions of rows |

Migrate to PostgreSQL when you have a team large enough that SQLite becomes a
bottleneck. That is a good problem to have. Do not solve it in v1.

## Database Schema

```sql
CREATE TABLE commits (
  id          TEXT PRIMARY KEY,      -- full UUID
  commit_hash TEXT NOT NULL,         -- full 40-char SHA (display 8 chars only)
  author      TEXT NOT NULL,         -- git config user.email
  timestamp   TEXT NOT NULL,         -- ISO 8601
  bypassed    INTEGER DEFAULT 0,     -- 1 if pre-commit was skipped
  session_id  TEXT                   -- for correlating re-commit attempts (v2)
);

CREATE TABLE violations (
  id          TEXT PRIMARY KEY,
  commit_id   TEXT REFERENCES commits(id),
  file_name   TEXT,                  -- NULL if privacy_mode: strict
  file_hash   TEXT,                  -- SHA256(filename) always stored
  rule_id     TEXT NOT NULL,         -- e.g. 'no-raw-sql'
  resolved    INTEGER DEFAULT 0,     -- 1 if fixed in a later commit
  session_id  TEXT                   -- for feedback loop tracking (v2)
);
```

## Authentication

A single secret key. No login page, no sessions, no JWTs. Set as a server environment
variable, must be sent in the `Authorization` header for all dashboard requests:

```bash
# Server environment
DASHBOARD_KEY=long-random-string-here
```

## Routes

| Route | Access control | Data source | Purpose |
|-------|---------------|-------------|---------|
| /demo | Public — no key required | Seeded fixture data | Portfolio links, sharing, interviews |
| /dashboard | DASHBOARD_KEY required | Real violation data | Actual team usage |
| /api/* | DASHBOARD_KEY required | Live database | CLI posts violations here |

## Self-Hosting

The dashboard is a standard Node/Express app with a SQLite file. Three deployment paths
are documented — no platform-specific deploy buttons or config files are maintained:

**Option 1 — Local (default)**
```bash
docker-compose up
# Dashboard at http://localhost:3000
```

**Option 2 — VPS (DigitalOcean, Hetzner, any Linux box)**
1. Clone the repo
2. Set `DASHBOARD_KEY` in your environment
3. `docker-compose up -d`
4. Point a reverse proxy (nginx/Caddy) at port 3000

**Option 3 — Cloud (Render, Railway, Fly.io, or any Node host)**

The dashboard requires:
- Node 18+
- One environment variable: `DASHBOARD_KEY`
- A persistent disk volume mounted at `./data/` for the SQLite file

Any platform supporting these three requirements works. Set `DASHBOARD_KEY` as an
environment variable on your platform of choice.

> ⚠️ **Persistent volume required.** The dashboard stores all data in SQLite at
> `./data/guardrails.db`. Platforms with ephemeral disk (e.g. free tiers on some
> cloud providers) will lose all violation history on every redeploy. Ensure this
> path is backed by a persistent volume before deploying to production.

Platform-specific config files (`render.yaml`, `railway.json`, `fly.toml`) are not
maintained in this repository. They are accepted as community contributions.

---

# I — Decision Log (Resolved from v2 Open Questions)

All five open questions from v2 Section I have been resolved. This section records
the decision and the reasoning for each.

## Q1 — Bypass Detection Reliability

**Decision:** Reconciliation on next hook run.

At each pre-commit invocation, compare the last 10 commits in `git log` against the
`commits` table. Any gap = bypassed. Mark `bypassed = 1` in the DB before proceeding
with the current review.

**Rejected approaches:**
- *Env var (`GUARDRAILS_RAN`)* — env vars are process-scoped. Git spawns hooks in
  separate shell processes. The var does not reliably survive across hook invocations
  in all configurations (worktrees, Husky, GitHub Actions).
- *Git notes* — the commit object doesn't exist when pre-commit runs. Architecturally
  invalid.
- *Sentinel file* — introduces statefulness and cleanup responsibility; race conditions
  in worktrees with parallel commits.

## Q2 — Token Estimation

**Decision:** Two thresholds — warn at 1500 tokens, split by file at 3000 tokens.
Estimate via `chars / 4`.

The primary risk is silent truncation: the model stops reading mid-diff and returns
a normal JSON response. Violations past the truncation point are silently missed.
File-splitting at 3000 tokens eliminates this risk. The warn threshold gives the
developer early signal on large commits without blocking them.

## Q3 — guardrails init Model Selection

**Decision:** Always prompt. Use RAM as a filter only (`os.totalmem() * 0.6`).
Run benchmark after pull to show real latency on the developer's hardware.

Pre-written benchmark numbers are meaningless on different hardware. The benchmark
after pull sets an accurate expectation before the first real commit, which is the
primary moment where `--no-verify` habits form.

## Q4 — Self-Hosting Documentation

**Decision:** Platform-agnostic prose only. No deploy buttons, no platform config
files maintained in-repo. Add explicit SQLite persistence warning.

Deploy buttons and platform-specific config files become stale when platform APIs
change — a silent failure mode that erodes trust. Any developer who finds an open
source tool on GitHub can follow a three-paragraph README without a deploy button.
Platform-specific configs are accepted as community contributions, not built as
first-party deliverables.

## Q5 — AST Rule Scope for v1

**Decision:** Rename to Static rules. Text/regex only in v1. Plugin extension point
reserved for v2 AST support.

True AST analysis requires a per-language parser (Babel for JS, `ast` module for
Python, etc.). Each adds native dependencies, installation complexity, and maintenance
surface. The rules teams write first (TODO, console.log, debug flags) are text-checkable
and don't need a parser. Function length — the canonical AST rule — is removed from v1
templates because regex cannot reliably detect function boundaries across languages.

The `[ast:rule-id]` tag is reserved in the rule file format for v2. The empty
`AST_PLUGINS` slot in `static-runner.js` is the extension point — additive in v2,
zero cost in v1.

## Q6 — Static Rule ID Binding (resolved in v3.0 review)

**Decision:** Explicit ID tag — `[static:rule-id]` — is the hard binding between
a rule file entry and its checker. Rule text is human-readable description only and
plays no role in matching.

**Rejected approach:** Pattern-matching checkers against free-form rule text. A
permissive matcher creates an injection surface — crafted rule descriptions in a
shared monorepo `.guardrails.md` could accidentally trigger unintended checkers.
Explicit IDs have no such ambiguity.

**Behaviour on missing or unknown ID:**
- `[static]` with no ID → rejected at parse time, error message shown, commit blocked
  until fixed (rule file is malformed, not a runtime condition)
- `[static:unknown-id]` → warn-and-skip at runtime (typo protection; fail-closed
  would block every commit on a typo, which is worse than the security risk it prevents)

**Rule-loader parse regex:** `/^\s*#\s*\[(static|llm|ast):?([\w-]*)\]/`
