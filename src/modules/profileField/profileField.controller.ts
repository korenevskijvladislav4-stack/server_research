import { Request, Response } from 'express';
import { profileFieldService } from './profileField.service';
import { AppError } from '../../errors/AppError';

export async function getAllProfileFields(_req: Request, res: Response): Promise<void> {
  const rows = await profileFieldService.getAll();
  res.json(rows);
}

export async function getProfileFieldById(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const row = await profileFieldService.getById(id);
  if (!row) {
    throw new AppError(404, 'Поле профиля не найдено');
  }
  res.json(row);
}

export async function createProfileField(req: Request, res: Response): Promise<void> {
  const data = req.body ?? {};
  const field = await profileFieldService.create(data);
  res.status(201).json(field);
}

export async function updateProfileField(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const data = req.body ?? {};
  if (Object.keys(data).length === 0) {
    throw new AppError(400, 'Нет полей для обновления');
  }
  const updated = await profileFieldService.update(id, data);
  res.json(updated);
}

export async function deleteProfileField(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const existing = await profileFieldService.getById(id);
  if (!existing) {
    throw new AppError(404, 'Поле профиля не найдено');
  }
  await profileFieldService.delete(id);
  res.json({ message: 'Profile field deleted' });
}
