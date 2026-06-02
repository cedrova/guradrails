/**
 * Parse and validate an LLM response string.
 * Returns { status, violations, raw? }.
 *
 * Malformed responses => { status: 'infrastructure_error', violations: [] }
 * The commit is allowed through on infrastructure errors (fail-open).
 */
export function parseResponse(raw) {
  let cleaned = raw.trim();

  // Strip markdown code fences if the model wraps JSON in them
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return { status: 'infrastructure_error', violations: [], raw };
  }

  if (!['pass', 'fail'].includes(parsed.status)) {
    return { status: 'infrastructure_error', violations: [], raw };
  }

  if (!Array.isArray(parsed.violations)) {
    return { status: 'infrastructure_error', violations: [], raw };
  }

  return parsed;
}
