import { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger';

const SENSITIVE_KEYS = new Set([
  'password',
  'pass',
  'token',
  'refreshtoken',
  'authorization',
  'cookie',
  'secret',
  'apikey',
  'apikey',
  'accesstoken',
  'clientsecret',
]);
const MAX_LOG_STRING_LENGTH = 2000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function maskSensitiveValue(value: unknown): string | null {
  if (value == null) return null;
  return '[REDACTED]';
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[TRUNCATED_DEPTH]';
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((v) => sanitizeValue(v, depth + 1));
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const normalizedKey = k.toLowerCase();
      if (SENSITIVE_KEYS.has(k) || SENSITIVE_KEYS.has(normalizedKey)) {
        result[k] = maskSensitiveValue(v);
      } else {
        result[k] = sanitizeValue(v, depth + 1);
      }
    }
    return result;
  }
  return value;
}

function truncateString(value: string): string {
  if (value.length <= MAX_LOG_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_LOG_STRING_LENGTH)}...[TRUNCATED_${value.length - MAX_LOG_STRING_LENGTH}_CHARS]`;
}

function sanitizeResponsePayload(value: unknown): unknown {
  const sanitized = sanitizeValue(value);
  if (typeof sanitized === 'string') return truncateString(sanitized);
  try {
    const asJson = JSON.stringify(sanitized);
    if (!asJson) return sanitized;
    if (asJson.length <= MAX_LOG_STRING_LENGTH) return sanitized;
    return { preview: truncateString(asJson) };
  } catch {
    return '[UNSERIALIZABLE_RESPONSE]';
  }
}

function createRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function requestAuditLogger(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();
  const requestId = (req.headers['x-request-id'] as string | undefined) || createRequestId();
  res.setHeader('x-request-id', requestId);

  const safeMeta = {
    requestId,
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    params: sanitizeValue(req.params),
    query: sanitizeValue(req.query),
    body: sanitizeValue(req.body),
  };
  let responseBody: unknown;

  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  res.json = ((body: unknown) => {
    responseBody = body;
    return originalJson(body);
  }) as Response['json'];
  res.send = ((body?: unknown) => {
    if (responseBody === undefined) responseBody = body;
    return originalSend(body);
  }) as Response['send'];

  logger.info(safeMeta, 'Request started');

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const userId = (req as any)?.user?.id;

    const resultMeta = {
      ...safeMeta,
      userId: userId ?? null,
      statusCode: res.statusCode,
      durationMs,
      response: sanitizeResponsePayload(responseBody),
    };

    if (res.statusCode >= 500) {
      logger.error(resultMeta, 'Request finished with server error');
      return;
    }
    if (res.statusCode >= 400) {
      logger.warn(resultMeta, 'Request finished with client error');
      return;
    }
    logger.info(resultMeta, 'Request finished');
  });

  next();
}
