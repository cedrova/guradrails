const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export class AnthropicProvider {
  constructor(config) {
    this._model   = config.model || 'claude-haiku-4-5';
    this._apiKey  = process.env.ANTHROPIC_API_KEY;
    this._timeout = (config.llm_timeout || 10) * 1000;
  }

  async isAvailable() {
    if (!this._apiKey) {
      return { ok: false, error: 'ANTHROPIC_API_KEY environment variable is not set' };
    }
    return { ok: true, error: null };
  }

  async generate(prompt, options = {}) {
    if (!this._apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set. Add it to your shell environment.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeout);

    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this._apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this._model,
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          `Anthropic API error ${res.status}: ${err.error?.message || res.statusText}`
        );
      }

      let full = '';
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          try {
            const chunk = JSON.parse(raw);
            if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
              process.stdout.write(chunk.delta.text);
              full += chunk.delta.text;
            }
          } catch { /* skip malformed SSE line */ }
        }
      }
      process.stdout.write('\n');
      return full;
    } catch (e) {
      if (e.name === 'AbortError') {
        throw new Error(`Anthropic review timed out after ${this._timeout / 1000}s`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}
