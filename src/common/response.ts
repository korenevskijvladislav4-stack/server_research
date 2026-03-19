import { Response } from 'express';
import { ValidationError } from 'express-validator';

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
