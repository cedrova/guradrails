import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class Cache {
  constructor(cachePath = null, ttlMs = DEFAULT_TTL_MS) {
    this._path = cachePath || join(homedir(), '.guardrails', 'cache.json');
    this._ttlMs = ttlMs;
    this._store = {};
    this._load();
  }

  _makeKey(filePath, diffContent) {
    return createHash('sha256').update(filePath + diffContent).digest('hex');
  }

  _load() {
    try {
      if (existsSync(this._path)) {
        this._store = JSON.parse(readFileSync(this._path, 'utf8'));
      }
    } catch {
      this._store = {};
    }
  }

  get(filePath, diffContent) {
    const key = this._makeKey(filePath, diffContent);
    const entry = this._store[key];
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this._ttlMs) {
      delete this._store[key];
      return null;
    }

    return entry.result;
  }

  set(filePath, diffContent, result) {
    const key = this._makeKey(filePath, diffContent);
    this._store[key] = { result, timestamp: Date.now() };
  }

  save() {
    const dir = dirname(this._path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this._path, JSON.stringify(this._store, null, 2));
  }
}
