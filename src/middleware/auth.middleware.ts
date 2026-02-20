import { Request, Response, NextFunction } from 'express';
import jwt, { TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: string;
  };
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

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role
    };

    next();
  } catch (error: any) {
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
