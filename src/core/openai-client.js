const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export class OpenAIProvider {
  constructor(config) {
    this._model   = config.model || 'gpt-4o-mini';
    this._apiKey  = process.env.OPENAI_API_KEY;
    this._timeout = (config.llm_timeout || 10) * 1000;
  }

  async isAvailable() {
    if (!this._apiKey) {
      return { ok: false, error: 'OPENAI_API_KEY environment variable is not set' };
    }
    return { ok: true, error: null };
  }

  async generate(prompt, options = {}) {
    if (!this._apiKey) {
      throw new Error('OPENAI_API_KEY is not set. Add it to your shell environment.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeout);

    try {
      const res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this._apiKey}`,
        },
        body: JSON.stringify({
          model: this._model,
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          `OpenAI API error ${res.status}: ${err.error?.message || res.statusText}`
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
          if (raw === '[DONE]') continue;
          try {
            const chunk = JSON.parse(raw);
            const token = chunk.choices?.[0]?.delta?.content;
            if (token) { process.stdout.write(token); full += token; }
          } catch { /* skip malformed SSE line */ }
        }
      }
      process.stdout.write('\n');
      return full;
    } catch (e) {
      if (e.name === 'AbortError') {
        throw new Error(`OpenAI review timed out after ${this._timeout / 1000}s`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}
