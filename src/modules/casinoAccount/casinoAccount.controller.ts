import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { casinoAccountService } from './casinoAccount.service';
import { parseQueryParams } from '../../common/utils';
import { AppError } from '../../errors/AppError';

export async function getAllCasinoAccounts(req: AuthRequest, res: Response): Promise<void> {
  const params = parseQueryParams(req.query);
  const result = await casinoAccountService.getAll(params);
  res.json(result);
}

export async function getCasinoAccounts(req: AuthRequest, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const rows = await casinoAccountService.getByCasino(casinoId);
  res.json(rows);
}

export async function createCasinoAccount(req: AuthRequest, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const { geo, password } = req.body ?? {};
  if (!geo || !password) {
    throw new AppError(400, 'GEO и пароль обязательны');
  }
  const account = await casinoAccountService.create(casinoId, req.body ?? {});
  res.status(201).json(account);
}

export async function updateCasinoAccount(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const existing = await casinoAccountService.getById(id);
  if (!existing) {
    throw new AppError(404, 'Аккаунт не найден');
  }
  const updated = await casinoAccountService.update(id, req.body ?? {});
  res.json(updated);
}

export async function deleteCasinoAccount(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const existing = await casinoAccountService.getById(id);
  if (!existing) {
    throw new AppError(404, 'Аккаунт не найден');
  }
  await casinoAccountService.delete(id);
  res.status(204).send();
}
