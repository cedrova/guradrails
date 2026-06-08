/**
 * HTTP client for the local Ollama server.
 * Supports streaming output and configurable timeout.
 */

const DEFAULT_BASE_URL = 'http://localhost:11434';

/**
 * Check if Ollama is reachable.
 * Returns { ok: true, version } or { ok: false, error }.
 */
export async function checkOllamaHealth(baseUrl = DEFAULT_BASE_URL) {
  try {
    const res = await fetch(`${baseUrl}/api/version`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, version: data.version };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * List locally available models.
 * Returns an array of model name strings.
 */
export async function listLocalModels(baseUrl = DEFAULT_BASE_URL) {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map(m => m.name);
  } catch {
    return [];
  }
}

/**
 * Send a prompt to Ollama and stream the response.
 * Pipes tokens to stdout in real-time for perceived speed.
 *
 * @param {string} prompt - The full prompt text
 * @param {string} model - Model name (e.g. 'qwen2.5-coder:1.5b')
 * @param {object} options - { timeoutMs, baseUrl, stream (boolean) }
 * @returns {Promise<string>} The complete response text
 */
export async function generate(prompt, model, options = {}) {
  const {
    timeoutMs = 20000,
    baseUrl = DEFAULT_BASE_URL,
    stream = true,
  } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Ollama returned HTTP ${res.status}`);
    }

    if (!stream) {
      const data = await res.json();
      return data.response;
    }

    // Streaming: read NDJSON line by line
    let fullResponse = '';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          if (chunk.response) {
            process.stdout.write(chunk.response);
            fullResponse += chunk.response;
          }
        } catch {
          // Skip malformed NDJSON lines
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      try {
        const chunk = JSON.parse(buffer);
        if (chunk.response) {
          process.stdout.write(chunk.response);
          fullResponse += chunk.response;
        }
      } catch {
        // Skip
      }
    }

    process.stdout.write('\n');
    return fullResponse;
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(`Ollama review timed out after ${timeoutMs / 1000}s`);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Pull a model from Ollama registry.
 * Streams progress to stdout.
 */
export async function pullModel(model, baseUrl = DEFAULT_BASE_URL) {
  const res = await fetch(`${baseUrl}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model, stream: true }),
  });

  if (!res.ok) {
    throw new Error(`Failed to pull model: HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line);
        if (chunk.status) {
          process.stdout.write(`\r  ${chunk.status}${chunk.completed ? ` ${Math.round(chunk.completed / 1e6)}MB` : ''}`);
        }
      } catch { /* skip */ }
    }
  }

  process.stdout.write('\n');
}

// ─── Provider class (v4 addition) ────────────────────────────────────────────

export class OllamaProvider {
  constructor(config) {
    this._model  = config.model || 'qwen2.5-coder:1.5b';
    this._timeout = (config.llm_timeout || config.ollama_timeout || 20) * 1000;
  }

  async isAvailable() {
    const health = await checkOllamaHealth();
    return { ok: health.ok, error: health.ok ? null : health.error };
  }

  async generate(prompt, options = {}) {
    return generate(prompt, this._model, {
      timeoutMs: this._timeout,
      ...options,
    });
  }
}
