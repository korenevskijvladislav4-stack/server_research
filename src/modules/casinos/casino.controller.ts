import { Request, Response } from 'express';
import { parseQueryParams } from '../../common/utils';
import { casinoService } from './casino.service';
import { sendError } from '../../common/response';
import { AuthRequest } from '../../middleware/auth.middleware';

export async function getAllCasinos(req: Request, res: Response): Promise<void> {
  try {
    const params = parseQueryParams(req.query);
    const result = await casinoService.findAll(params);
    res.json(result);
  } catch (e) {
    console.error('getAllCasinos:', e);
    sendError(res, 500, 'Failed to fetch casinos');
  }
}

export async function getCasinoById(req: Request, res: Response): Promise<void> {
  try {
    const casino = await casinoService.findById(req.params.id);
    if (!casino) {
      sendError(res, 404, 'Casino not found');
      return;
    }
    res.json(casino);
  } catch (e) {
    console.error('getCasinoById:', e);
    sendError(res, 500, 'Failed to fetch casino');
  }
}

export async function createCasino(req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = req.body as { name: string; website?: string; description?: string; geo?: string[]; is_our?: boolean; status?: string };
    if (!data?.name?.trim()) {
      sendError(res, 400, 'Name is required');
      return;
    }
    const userId = req.user?.id;
    const casino = await casinoService.create(data, userId);
    res.status(201).json(casino);
  } catch (e) {
    console.error('createCasino:', e);
    sendError(res, 500, 'Failed to create casino');
  }
}

export async function updateCasino(req: Request, res: Response): Promise<void> {
  try {
    const casino = await casinoService.update(req.params.id, req.body);
    if (!casino) {
      sendError(res, 404, 'Casino not found');
      return;
    }
    res.json(casino);
  } catch (e) {
    console.error('updateCasino:', e);
    sendError(res, 500, 'Failed to update casino');
  }
}

export async function deleteCasino(req: Request, res: Response): Promise<void> {
  try {
    const deleted = await casinoService.delete(req.params.id);
    if (!deleted) {
      sendError(res, 404, 'Casino not found');
      return;
    }
    res.json({ message: 'Casino deleted successfully' });
  } catch (e) {
    console.error('deleteCasino:', e);
    sendError(res, 500, 'Failed to delete casino');
  }
}
