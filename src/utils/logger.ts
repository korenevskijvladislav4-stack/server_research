const SENSITIVE_KEYS = ['password', 'token', 'authorization', 'cookie', 'secret'];

function redact(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_KEYS.some((k) => lower.includes(k))) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = redact(value);
    }
  }
  return out;
}

function asRecord(obj: unknown): Record<string, unknown> {
  if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) return obj as Record<string, unknown>;
  return {};
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    const payload = meta ? asRecord(redact(meta)) : undefined;
    console.log(JSON.stringify({ level: 'info', message, ...(payload && Object.keys(payload).length > 0 ? { meta: payload } : {}) }));
  },
  error(message: string, err?: unknown, meta?: Record<string, unknown>): void {
    const errMsg = err instanceof Error ? err.message : String(err);
    const payload = meta ? asRecord(redact(meta)) : {};
    if (err instanceof Error && err.stack) payload.stack = err.stack;
    console.error(JSON.stringify({ level: 'error', message, error: errMsg, ...payload }));
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    const payload = meta ? asRecord(redact(meta)) : undefined;
    console.warn(JSON.stringify({ level: 'warn', message, ...(payload && Object.keys(payload).length > 0 ? { meta: payload } : {}) }));
  },
};
