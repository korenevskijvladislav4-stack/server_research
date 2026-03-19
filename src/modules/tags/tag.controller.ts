import { Request, Response } from 'express';
import { tagService } from './tag.service';
import { AppError } from '../../errors/AppError';

export async function listTags(_req: Request, res: Response): Promise<void> {
  const rows = await tagService.list();
  res.json(rows);
}

export async function createTag(req: Request, res: Response): Promise<void> {
  const { name, color } = req.body as { name?: string; color?: string };
  if (!name || !String(name).trim()) {
    throw new AppError(400, 'Название обязательно');
  }
  const tag = await tagService.create(String(name).trim(), color);
  res.status(201).json(tag);
}

export async function deleteTag(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    throw new AppError(400, 'Некорректный ID тега');
  }
  const ok = await tagService.delete(id);
  if (!ok) {
    throw new AppError(404, 'Тег не найден');
  }
  res.json({ message: 'Tag deleted' });
}

export async function getCasinoTags(req: Request, res: Response): Promise<void> {
  const casinoId = parseInt(req.params.casinoId, 10);
  if (isNaN(casinoId)) {
    throw new AppError(400, 'Некорректный ID казино');
  }
  const rows = await tagService.getByCasinoId(casinoId);
  res.json(rows);
}

export async function setCasinoTags(req: Request, res: Response): Promise<void> {
  const casinoId = parseInt(req.params.casinoId, 10);
  const { tagIds } = req.body as { tagIds?: number[] };
  if (isNaN(casinoId)) {
    throw new AppError(400, 'Некорректный ID казино');
  }
  if (!Array.isArray(tagIds)) {
    throw new AppError(400, 'tagIds должен быть массивом');
  }
  const ids = tagIds.map((id) => Number(id)).filter((id) => !isNaN(id));
  const rows = await tagService.setForCasino(casinoId, ids);
  res.json(rows);
}

export async function getAllCasinoTags(_req: Request, res: Response): Promise<void> {
  const map = await tagService.getAllCasinoTags();
  res.json(map);
}
