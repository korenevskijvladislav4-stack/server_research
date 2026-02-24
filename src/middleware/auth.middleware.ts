import { Request, Response, NextFunction } from 'express';
import jwt, { TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';
import { getConfig } from '../config/env';

export interface JwtPayload {
  id: number;
  email: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const token =
      req.headers.authorization?.split(' ')[1] ||
      (req.query.token as string | undefined);

    if (!token) {
      res.status(401).json({ error: 'Токен не передан', code: 'NO_TOKEN' });
      return;
    }

    const { jwt: jwtConfig } = getConfig();
    const decoded = jwt.verify(token, jwtConfig.secret) as JwtPayload;
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (error: unknown) {
    if (error instanceof TokenExpiredError) {
      res.status(401).json({ error: 'Сессия истекла. Войдите снова.', code: 'TOKEN_EXPIRED' });
      return;
    }
    if (error instanceof JsonWebTokenError) {
      res.status(401).json({ error: 'Неверный токен авторизации', code: 'INVALID_TOKEN' });
      return;
    }
    res.status(401).json({ error: 'Ошибка авторизации', code: 'AUTH_ERROR' });
  }
};
