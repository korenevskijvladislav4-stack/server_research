import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { isAppError } from '../errors/AppError';
import { getConfig } from '../config/env';
import { logger } from '../utils/logger';

const PRISMA_ERROR_MAP: Record<string, { status: number; message: string }> = {
  P2000: { status: 400, message: 'Значение слишком длинное для поля в базе данных' },
  P2002: { status: 409, message: 'Запись с такими данными уже существует' },
  P2025: { status: 404, message: 'Запись не найдена' },
  P2003: { status: 400, message: 'Нарушена связь между записями' },
  P2014: { status: 400, message: 'Невозможно удалить — есть связанные записи' },
};

/** P2002 meta.target: массив полей или одно поле строкой (зависит от БД / драйвера Prisma). */
function normalizePrismaUniqueTarget(meta: Prisma.PrismaClientKnownRequestError['meta']): string[] {
  const raw = meta?.target;
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x));
  return [String(raw)];
}

function getPrismaFieldHint(err: Prisma.PrismaClientKnownRequestError): string | undefined {
  if (err.code === 'P2000') {
    let col = err.meta?.column_name != null ? String(err.meta.column_name) : '';
    if (!col && typeof err.message === 'string') {
      const m = err.message.match(/Column:\s*(\w+)/i);
      if (m) col = m[1];
    }
    if (col === 'code') {
      return 'Код GEO не длиннее 10 символов (поле в базе ограничено, как и GEO в бонусах/платежах)';
    }
    if (col === 'name') {
      return 'Название GEO не длиннее 100 символов';
    }
    if (col) {
      return `Значение слишком длинное для поля «${col}»`;
    }
  }
  if (err.code === 'P2002') {
    const target = normalizePrismaUniqueTarget(err.meta);
    if (target.length > 0) {
      const fieldNames: Record<string, string> = {
        email: 'email',
        username: 'имя пользователя',
        name: 'название',
        code: 'код',
      };
      const readable = target.map((f) => fieldNames[f] || f).join(', ');
      return `Поле «${readable}» уже занято`;
    }
  }
  return undefined;
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const config = getConfig();
  const isDev = config.nodeEnv === 'development';

  logger.error({ err, url: req.url, method: req.method, path: req.path }, 'Unhandled error');

  if (res.headersSent) {
    logger.warn('Response already sent, cannot send error response');
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

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = PRISMA_ERROR_MAP[err.code];
    if (mapped) {
      const hint = getPrismaFieldHint(err);
      res.status(mapped.status).json({
        error: hint || mapped.message,
        code: err.code,
      });
      return;
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({
      error: 'Некорректные данные запроса',
      code: 'VALIDATION_ERROR',
    });
    return;
  }

  const anyErr = err as Error & { type?: string; statusCode?: number };
  if (
    anyErr.name === 'PayloadTooLargeError' ||
    anyErr.type === 'entity.too.large' ||
    anyErr.statusCode === 413
  ) {
    res.status(413).json({
      error:
        'Тело запроса слишком большое. Вставьте меньший фрагмент текста или увеличьте JSON_BODY_LIMIT на сервере.',
      code: 'PAYLOAD_TOO_LARGE',
    });
    return;
  }

  res.status(500).json({
    error: 'Внутренняя ошибка сервера',
    ...(isDev && { message: err.message, stack: err.stack, path: req.path, method: req.method }),
  });
};
