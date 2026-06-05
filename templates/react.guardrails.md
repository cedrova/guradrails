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
