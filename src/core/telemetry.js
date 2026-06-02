import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';

class TelemetryInterface {
  async send(event) {
    throw new Error('Not implemented');
  }
}

export class LocalTelemetry extends TelemetryInterface {
  constructor() {
    super();
    this._dir = join(homedir(), '.guardrails');
    this._path = join(this._dir, 'history.jsonl');
  }

  async send(event) {
    if (!existsSync(this._dir)) {
      mkdirSync(this._dir, { recursive: true });
    }
    appendFileSync(this._path, JSON.stringify(event) + '\n');
  }
}

export class DashboardTelemetry extends TelemetryInterface {
  constructor(config) {
    super();
    this._url = config.dashboard_url;
    this._key = process.env.GUARDRAILS_KEY;
    this._privacyMode = config.privacy_mode;
  }

  _sanitizeFileName(fileName) {
    if (this._privacyMode === 'strict') {
      return createHash('sha256').update(fileName).digest('hex');
    }
    return fileName;
  }

  async send(event) {
    const payload = {
      commit_hash: event.commit_hash,
      author: event.author,
      timestamp: event.timestamp,
      result: event.result, // 'pass' | 'fail' | 'partially_reviewed'
      bypassed: event.bypassed || false,
      files: (event.files || []).map(f => ({
        file_name: this._sanitizeFileName(f.file_name),
        file_hash: createHash('sha256').update(f.file_name).digest('hex'),
        rule_ids: f.rule_ids || [],
      })),
    };

    try {
      await fetch(`${this._url}/api/commits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this._key}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Dashboard sync failure is non-blocking — silently skip
    }
  }
}

/**
 * Factory: creates the correct telemetry adapter based on config.
 */
export function createTelemetry(config) {
  if (config.dashboard_url && process.env.GUARDRAILS_KEY) {
    return new DashboardTelemetry(config);
  }
  return new LocalTelemetry();
}
