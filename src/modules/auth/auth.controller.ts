import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getConfig } from '../../config/env';
import { AppError } from '../../errors/AppError';
import { authService } from './auth.service';
import { logger } from '../../utils/logger';

export async function register(req: Request, res: Response): Promise<void> {
  const { username, email, password } = req.body as { username: string; email: string; password: string };

  const existing = await authService.findUserByEmailOrUsername(email, username);
  if (existing) {
    throw new AppError(400, 'Пользователь уже существует');
  }

  await authService.createUser(username, email, password);
  res.status(201).json({ message: 'User created successfully' });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };
  const config = getConfig();
  const { password: _password, ...safeBody } = (req.body ?? {}) as Record<string, unknown>;
  const requestMeta = {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    body: safeBody,
  };

  logger.info(requestMeta, 'Login attempt');

  const user = await authService.findUserByEmail(email);
  if (!user) {
    logger.warn({ ...requestMeta, email }, 'Login failed: user not found');
    throw new AppError(401, 'Неверный email или пароль');
  }

  if (!user.password) {
    logger.error({ ...requestMeta, userId: user.id, email: user.email }, 'Login failed: missing password hash');
    throw new AppError(500, 'Ошибка данных пользователя', 'MISSING_PASSWORD');
  }

  if (!user.is_active) {
    logger.warn({ ...requestMeta, userId: user.id, email: user.email }, 'Login failed: account inactive');
    throw new AppError(401, 'Аккаунт деактивирован');
  }

  const valid = await authService.validatePassword(String(password), user.password);
  if (!valid) {
    logger.warn({ ...requestMeta, userId: user.id, email: user.email }, 'Login failed: invalid password');
    throw new AppError(401, 'Неверный email или пароль');
  }

  const role = user.role ?? 'user';
  const token = jwt.sign(
    { id: user.id, email: user.email, role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn } as jwt.SignOptions,
  );

  logger.info({ ...requestMeta, userId: user.id, email: user.email, role }, 'Login successful');

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role,
    },
  });
}
