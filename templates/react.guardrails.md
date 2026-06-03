# Guardrails Rules — React

[static:no-console-log]
[static:no-todo-comments]
[static:no-debug-flag]
[static:no-http-urls]

[llm] Never use dangerouslySetInnerHTML without sanitizing input first.
[llm] Never hardcode secrets, API keys, or passwords in source code.
[llm] Never store sensitive data in localStorage or sessionStorage.
