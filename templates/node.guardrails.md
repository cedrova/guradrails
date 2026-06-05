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
