import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { AppError } from '../../errors/AppError';
import { aiEmailProposalService } from '../../services/email-ai-proposal.service';

export async function listProposals(req: AuthRequest, res: Response): Promise<void> {
  const viewedRaw = req.query.viewed;
  const viewedParam = Array.isArray(viewedRaw) ? viewedRaw[0] : viewedRaw;
  /** null — без фильтра по просмотру (вкладка «Все») */
  const viewedFilter: boolean | null =
    viewedParam === 'all' || viewedParam === '*'
      ? null
      : String(viewedParam) === '1'
        ? true
        : false;
  const type = req.query.type as 'bonus' | 'promo' | undefined;
  const geoRaw = req.query.geo;
  const geos: string[] = (Array.isArray(geoRaw) ? geoRaw.map(String) : (geoRaw ? [String(geoRaw)] : [])).filter(Boolean);
  const casinoRaw = req.query.casino_id;
  const casinoNum =
    casinoRaw != null && casinoRaw !== ''
      ? Number(Array.isArray(casinoRaw) ? casinoRaw[0] : casinoRaw)
      : NaN;
  const casino_id = !Number.isNaN(casinoNum) && casinoNum > 0 ? casinoNum : undefined;

  const rows = await aiEmailProposalService.list(viewedFilter, type, {
    ...(geos.length > 0 ? { geo: geos } : {}),
    ...(casino_id != null ? { casino_id } : {}),
  });
  res.json(rows);
}

export async function getProposal(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const row = await aiEmailProposalService.getById(id);
  if (!row) throw new AppError(404, 'Не найдено');
  res.json(row);
}

export async function markProposalViewed(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const row = await aiEmailProposalService.markViewed(id);
  res.json(row);
}

export async function rejectProposal(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const row = await aiEmailProposalService.reject(id, req.user?.id ?? null);
  res.json(row);
}

export async function approveBonusProposal(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const casinoId = Number(req.body?.casino_id);
  if (!casinoId) {
    res.status(400).json({ error: 'casino_id обязателен' });
    return;
  }
  const { casino_id: _c, ...rest } = req.body ?? {};
  const result = await aiEmailProposalService.approveBonus(id, casinoId, rest, req.user?.id ?? null);
  res.json(result);
}

export async function approvePromoProposal(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const casinoId = Number(req.body?.casino_id);
  if (!casinoId) {
    res.status(400).json({ error: 'casino_id обязателен' });
    return;
  }
  const { casino_id: _c, ...rest } = req.body ?? {};
  const result = await aiEmailProposalService.approvePromo(id, casinoId, rest, req.user?.id ?? null);
  res.json(result);
}

/** POST body: { email_id, type: 'bonus'|'promo', force?: boolean } — опционально query ?force=1 */
export async function devTriggerProposal(req: AuthRequest, res: Response): Promise<void> {
  const emailId = Number(req.body?.email_id ?? req.body?.emailId);
  const type = req.body?.type as 'bonus' | 'promo' | undefined;
  const force =
    String(req.query.force) === '1' || req.query.force === 'true' || req.body?.force === true;
  if (!emailId || (type !== 'bonus' && type !== 'promo')) {
    res.status(400).json({ error: 'Укажите email_id (или emailId) и type: bonus | promo' });
    return;
  }
  const result = await aiEmailProposalService.devTrigger(emailId, type, force);
  res.json(result);
}
