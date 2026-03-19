import { Request, Response } from 'express';
import { parseQueryParams } from '../../common/utils';
import { casinoService } from './casino.service';
import { AppError } from '../../errors/AppError';
import { AuthRequest } from '../../middleware/auth.middleware';

export async function getAllCasinos(req: Request, res: Response): Promise<void> {
  const params = parseQueryParams(req.query);
  const result = await casinoService.findAll(params);
  res.json(result);
}

export async function getCasinoById(req: Request, res: Response): Promise<void> {
  const casino = await casinoService.findById(req.params.id);
  if (!casino) throw new AppError(404, 'Казино не найдено');
  res.json(casino);
}

export async function createCasino(req: AuthRequest, res: Response): Promise<void> {
  const data = req.body as { name: string; website?: string; description?: string; geo?: string[]; is_our?: boolean; status?: string };
  if (!data?.name?.trim()) {
    throw new AppError(400, 'Название обязательно');
  }
  const userId = req.user?.id;
  const casino = await casinoService.create(data, userId);
  res.status(201).json(casino);
}

export async function updateCasino(req: Request, res: Response): Promise<void> {
  const casino = await casinoService.update(req.params.id, req.body);
  if (!casino) throw new AppError(404, 'Казино не найдено');
  res.json(casino);
}

export async function deleteCasino(req: Request, res: Response): Promise<void> {
  const deleted = await casinoService.delete(req.params.id);
  if (!deleted) throw new AppError(404, 'Казино не найдено');
  res.json({ message: 'Casino deleted successfully' });
}
