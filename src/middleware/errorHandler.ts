import { Request, Response, NextFunction } from 'express';
import { isAppError } from '../errors/AppError';
import { getConfig } from '../config/env';
import { logger } from '../utils/logger';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const config = getConfig();
  const isDev = config.nodeEnv === 'development';

  logger.error('Error handler caught', err, { url: req.url, method: req.method, path: req.path });
  if (isDev && err.stack) {
    logger.error('Stack', undefined, { stack: err.stack });
  }

  if (res.headersSent) {
    console.error('Response already sent, cannot send error response');
    return;
  }

  if (isAppError(err)) {
    const body: Record<string, unknown> = {
      error: err.message,
      ...(err.code && { code: err.code }),
    };
    if (isDev && err.stack) {
      body.stack = err.stack;
      body.path = req.path;
      body.method = req.method;
    }
    res.status(err.statusCode).json(body);
    return;
  }

  res.status(500).json({
    error: 'Internal Server Error',
    message: isDev ? err.message : 'Something went wrong',
    ...(isDev && err.stack && { stack: err.stack, path: req.path, method: req.method }),
  });
};
