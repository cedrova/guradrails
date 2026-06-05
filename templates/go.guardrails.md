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
