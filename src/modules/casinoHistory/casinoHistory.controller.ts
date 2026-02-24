import { Request, Response } from 'express';
import { casinoHistoryService } from './casinoHistory.service';
import { sendError } from '../../common/response';

export async function listHistory(req: Request, res: Response): Promise<void> {
  try {
    const casinoId = Number(req.params.casinoId);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    const result = await casinoHistoryService.list(casinoId, limit, offset);
    res.json(result);
  } catch (e) {
    console.error('listHistory error:', e);
    sendError(res, 500, 'Failed to list history');
  }
}
