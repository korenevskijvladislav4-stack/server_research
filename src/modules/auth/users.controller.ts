import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { sendError } from '../../common/response';
import { usersService } from './users.service';
import { parseQueryParams } from '../../common/utils';

export async function getAllUsers(req: AuthRequest, res: Response): Promise<void> {
  try {
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
  } catch (e) {
    console.error('getAllUsers:', e);
    sendError(res, 500, 'Failed to fetch users');
  }
}

export async function createUser(req: AuthRequest, res: Response): Promise<void> {
  try {
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
  } catch (e: any) {
    if (e?.message === 'USER_EXISTS') {
      sendError(res, 400, 'User with this email or username already exists');
      return;
    }
    console.error('createUser:', e);
    sendError(res, 500, 'Failed to create user');
  }
}

export async function updateUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'Invalid user id');
      return;
    }
    const { username, email, password, role, is_active } = req.body;
    const user = await usersService.update(id, { username, email, password, role, is_active });
    if (!user) {
      sendError(res, 404, 'User not found');
      return;
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
  } catch (e: any) {
    if (e?.message === 'EMAIL_OR_USERNAME_TAKEN') {
      sendError(res, 400, 'Email or username already taken by another user');
      return;
    }
    console.error('updateUser:', e);
    sendError(res, 500, 'Failed to update user');
  }
}

export async function deleteUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'Invalid user id');
      return;
    }
    const ok = await usersService.deactivate(id);
    if (!ok) {
      sendError(res, 404, 'User not found');
      return;
    }
    res.status(204).send();
  } catch (e) {
    console.error('deleteUser:', e);
    sendError(res, 500, 'Failed to delete user');
  }
}
