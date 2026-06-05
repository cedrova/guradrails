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
