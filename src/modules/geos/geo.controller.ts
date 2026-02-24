import { Request, Response } from 'express';
import { geoService } from './geo.service';
import { sendError } from '../../common/response';

export async function getGeos(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await geoService.findAllActive();
    res.json(rows);
  } catch (e) {
    console.error('getGeos:', e);
    sendError(res, 500, 'Failed to fetch geos');
  }
}

export async function createGeo(req: Request, res: Response): Promise<void> {
  try {
    const { code, name } = req.body as { code?: string; name?: string };
    if (!code || !String(code).trim()) {
      sendError(res, 400, 'code is required');
      return;
    }
    const { geo, isNew } = await geoService.create(String(code).trim(), name);
    if (isNew) res.status(201).json(geo);
    else res.json(geo);
  } catch (e) {
    console.error('createGeo:', e);
    sendError(res, 500, 'Failed to create geo');
  }
}
