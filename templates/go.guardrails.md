# Guardrails Rules — Go

[static:no-todo-comments]
[static:no-debug-flag]
[static:no-http-urls]

[llm] Never concatenate SQL strings — always use parameterized queries.
[llm] Never hardcode secrets, API keys, or passwords in source code.
[llm] Never ignore errors — always handle or propagate them.
