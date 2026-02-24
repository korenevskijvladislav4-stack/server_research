import { Response } from 'express';
import { AppError } from '../errors/AppError';
import { ValidationError } from 'express-validator';

export interface ApiErrorBody {
  error: string;
  code?: string;
  details?: unknown;
}

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json({ data });
}

export function sendError(res: Response, statusCode: number, message: string, code?: string): void {
  const body: ApiErrorBody = { error: message };
  if (code) body.code = code;
  res.status(statusCode).json(body);
}

export function sendValidationErrors(
  res: Response,
  errors: ValidationError[],
  statusCode = 400
): void {
  const message = errors.map((e) => e.msg).join('; ') || 'Validation failed';
  const details = errors.map((e) => ({ path: 'path' in e ? e.path : undefined, msg: e.msg }));
  res.status(statusCode).json({
    error: message,
    code: 'VALIDATION_ERROR',
    details,
  });
}

export function sendAppError(res: Response, err: AppError): void {
  const body: ApiErrorBody = { error: err.message };
  if (err.code) body.code = err.code;
  res.status(err.statusCode).json(body);
}
