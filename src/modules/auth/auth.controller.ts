import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getConfig } from '../../config/env';
import { AppError } from '../../errors/AppError';
import { authService } from './auth.service';

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

  const user = await authService.findUserByEmail(email);
  if (!user) {
    throw new AppError(401, 'Неверный email или пароль');
  }

  if (!user.password) {
    throw new AppError(500, 'Ошибка данных пользователя', 'MISSING_PASSWORD');
  }

  if (!user.is_active) {
    throw new AppError(401, 'Аккаунт деактивирован');
  }

  const valid = await authService.validatePassword(String(password), user.password);
  if (!valid) {
    throw new AppError(401, 'Неверный email или пароль');
  }

  const role = user.role ?? 'user';
  const token = jwt.sign(
    { id: user.id, email: user.email, role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn } as jwt.SignOptions,
  );

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
