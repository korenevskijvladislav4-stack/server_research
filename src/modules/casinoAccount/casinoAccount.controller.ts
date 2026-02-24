import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { casinoAccountService } from './casinoAccount.service';
import { parseQueryParams } from '../../common/utils';
import { sendError } from '../../common/response';

export async function getAllCasinoAccounts(req: AuthRequest, res: Response): Promise<void> {
  try {
    const params = parseQueryParams(req.query);
    const result = await casinoAccountService.getAll(params);
    res.json(result);
  } catch (e) {
    console.error('getAllCasinoAccounts error:', e);
    sendError(res, 500, 'Failed to fetch accounts');
  }
}

export async function getCasinoAccounts(req: AuthRequest, res: Response): Promise<void> {
  try {
    const casinoId = Number(req.params.casinoId);
    const rows = await casinoAccountService.getByCasino(casinoId);
    res.json(rows);
  } catch (e) {
    console.error('getCasinoAccounts error:', e);
    sendError(res, 500, 'Failed to fetch casino accounts');
  }
}

export async function createCasinoAccount(req: AuthRequest, res: Response): Promise<void> {
  try {
    const casinoId = Number(req.params.casinoId);
    const { geo, password } = req.body ?? {};
    if (!geo || !password) {
      sendError(res, 400, 'GEO and password are required');
      return;
    }
    const account = await casinoAccountService.create(casinoId, req.body ?? {});
    res.status(201).json(account);
  } catch (e) {
    console.error('createCasinoAccount error:', e);
    sendError(res, 500, 'Failed to create casino account');
  }
}

export async function updateCasinoAccount(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    const existing = await casinoAccountService.getById(id);
    if (!existing) {
      sendError(res, 404, 'Account not found');
      return;
    }
    const updated = await casinoAccountService.update(id, req.body ?? {});
    res.json(updated);
  } catch (e) {
    console.error('updateCasinoAccount error:', e);
    sendError(res, 500, 'Failed to update casino account');
  }
}

export async function deleteCasinoAccount(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    const existing = await casinoAccountService.getById(id);
    if (!existing) {
      sendError(res, 404, 'Account not found');
      return;
    }
    await casinoAccountService.delete(id);
    res.status(204).send();
  } catch (e) {
    console.error('deleteCasinoAccount error:', e);
    sendError(res, 500, 'Failed to delete casino account');
  }
}

