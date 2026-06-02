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
