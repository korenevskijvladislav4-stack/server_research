import { Request, Response } from 'express';
import { profileContextService } from './profileContext.service';
import { AppError } from '../../errors/AppError';

export async function getAllProfileContexts(_req: Request, res: Response): Promise<void> {
  const rows = await profileContextService.getAll();
  res.json(rows);
}

export async function getProfileContextById(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const row = await profileContextService.getById(id);
  if (!row) {
    throw new AppError(404, 'Контекст профиля не найден');
  }
  res.json(row);
}

export async function createProfileContext(req: Request, res: Response): Promise<void> {
  const data = req.body ?? {};
  const ctx = await profileContextService.create(data);
  res.status(201).json(ctx);
}

export async function updateProfileContext(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const data = req.body ?? {};
  if (Object.keys(data).length === 0) {
    throw new AppError(400, 'Нет полей для обновления');
  }
  const updated = await profileContextService.update(id, data);
  res.json(updated);
}

export async function deleteProfileContext(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const existing = await profileContextService.getById(id);
  if (!existing) {
    throw new AppError(404, 'Контекст профиля не найден');
  }
  await profileContextService.delete(id);
  res.json({ message: 'Profile context deleted' });
}
