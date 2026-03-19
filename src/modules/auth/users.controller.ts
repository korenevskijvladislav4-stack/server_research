import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { AppError } from '../../errors/AppError';
import { usersService } from './users.service';
import { parseQueryParams } from '../../common/utils';

export async function getAllUsers(req: AuthRequest, res: Response): Promise<void> {
  const params = parseQueryParams(req.query);
  const result = await usersService.findAll({
    page: params.page,
    pageSize: params.pageSize,
    sortField: params.sortField,
    sortOrder: params.sortOrder === 'desc' ? 'desc' : 'asc',
    search: params.search,
    role: req.query.role as string | undefined,
    is_active: req.query.is_active,
  });
  res.json(result);
}

export async function createUser(req: AuthRequest, res: Response): Promise<void> {
  const { username, email, password, role = 'user', is_active = true } = req.body;
  const user = await usersService.create({ username, email, password, role, is_active });
  res.status(201).json({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    is_active: user.is_active,
    created_at: user.created_at,
    updated_at: user.updated_at,
  });
}

export async function updateUser(req: AuthRequest, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    throw new AppError(400, 'Некорректный ID пользователя');
  }
  const { username, email, password, role, is_active } = req.body;
  const user = await usersService.update(id, { username, email, password, role, is_active });
  if (!user) {
    throw new AppError(404, 'Пользователь не найден');
  }
  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    is_active: user.is_active,
    created_at: user.created_at,
    updated_at: user.updated_at,
  });
}

export async function deleteUser(req: AuthRequest, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    throw new AppError(400, 'Некорректный ID пользователя');
  }
  const ok = await usersService.deactivate(id);
  if (!ok) {
    throw new AppError(404, 'Пользователь не найден');
  }
  res.status(204).send();
}
