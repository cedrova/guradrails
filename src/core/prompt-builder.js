/**
 * Build the structured prompt for Ollama.
 * Only includes rules with type === 'llm'.
 * The prompt structure is fixed and not user-configurable.
 */
export function buildPrompt(rules, diff) {
  const llmRules = rules.filter(r => r.type === 'llm');

  const numberedRules = llmRules
    .map((r, i) => `${i + 1}. ${r.text}`)
    .join('\n');

  return `You are a code reviewer enforcing a strict set of rules. You will be given a git diff and a list of rules. Your job is to check whether the diff violates any rule.

Rules:
${numberedRules}

Diff:
${diff}

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
Do not include any text outside the JSON object.`;
}
