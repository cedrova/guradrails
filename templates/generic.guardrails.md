# .guardrails.md — Generic (language-agnostic)

## Static Rules
# [static:no-todo-comments]  Do not commit code with TODO or FIXME comments.
# [static:no-debug-flag]     Never set debug: true in committed code.
# [static:no-http-urls]      Never hardcode http:// URLs (use environment variables).

## LLM Rules
# [llm] Never hardcode secrets, API keys, or passwords.
#        These must come from environment variables.
# [llm] Never commit commented-out code blocks. Remove dead code instead.
