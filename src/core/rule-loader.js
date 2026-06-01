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
