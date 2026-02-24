import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { withConnection } from '../database/withConnection';
import { findUserByEmailOrUsername, findUserByEmail, createUser } from '../repositories/user.repository';
import { getConfig } from '../config/env';
import { sendError } from '../common/response';
import { AppError } from '../errors/AppError';

export const register = async (req: Request, res: Response): Promise<void> => {
  const { username, email, password } = req.body as { username: string; email: string; password: string };

  const existing = await withConnection((conn) =>
    findUserByEmailOrUsername(conn, email, username)
  );
  if (existing) {
    sendError(res, 400, 'User already exists');
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  await withConnection((conn) =>
    createUser(conn, username, email, hashedPassword)
  );

  res.status(201).json({ message: 'User created successfully' });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email: string; password: string };
  const config = getConfig();

  const user = await withConnection((conn) => findUserByEmail(conn, email));
  if (!user) {
    sendError(res, 401, 'Неверный email или пароль');
    return;
  }

  const rawPassword = user.password;
  if (!rawPassword) {
    throw new AppError(500, 'User data error', 'MISSING_PASSWORD');
  }

  if (user.is_active === false || user.is_active === 0) {
    sendError(res, 401, 'Аккаунт деактивирован');
    return;
  }

  const hash = typeof rawPassword === 'string' ? rawPassword : String(rawPassword);
  const isValidPassword = await bcrypt.compare(String(password), hash);
  if (!isValidPassword) {
    sendError(res, 401, 'Неверный email или пароль');
    return;
  }

  try {
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role || 'user' },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
    );
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role || 'user',
      },
    });
  } catch (err) {
    throw new AppError(
      500,
      err instanceof Error ? err.message : 'Token generation failed',
      'JWT_ERROR'
    );
  }
};
