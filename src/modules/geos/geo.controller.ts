import { Request, Response } from 'express';
import { geoService } from './geo.service';
import { AppError } from '../../errors/AppError';

export async function getGeos(req: Request, res: Response): Promise<void> {
  const all = req.query.all === '1' || req.query.all === 'true';
  const rows = all ? await geoService.findAllOrdered() : await geoService.findAllActive();
  res.json(rows);
}

export async function createGeo(req: Request, res: Response): Promise<void> {
  const { code, name } = req.body as { code?: string; name?: string };
  if (!code || !String(code).trim()) {
    throw new AppError(400, 'Код обязателен');
  }
  const { geo, isNew } = await geoService.create(String(code).trim(), name);
  if (isNew) res.status(201).json(geo);
  else res.json(geo);
}

export async function deleteGeo(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  await geoService.deleteById(id);
  res.status(204).send();
}
