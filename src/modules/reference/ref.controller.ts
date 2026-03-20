import { Request, Response } from 'express';
import { refService } from './ref.service';
import { AppError } from '../../errors/AppError';

export async function getBonusNames(_req: Request, res: Response): Promise<void> {
  const rows = await refService.bonusNames.list();
  res.json(rows);
}

export async function createBonusName(req: Request, res: Response): Promise<void> {
  const name = req.body?.name;
  if (!name || !String(name).trim()) {
    throw new AppError(400, 'Название обязательно');
  }
  const { item, isNew } = await refService.bonusNames.create(String(name));
  if (isNew) res.status(201).json(item);
  else res.json(item);
}

export async function getPaymentTypes(_req: Request, res: Response): Promise<void> {
  const rows = await refService.paymentTypes.list();
  res.json(rows);
}

export async function createPaymentType(req: Request, res: Response): Promise<void> {
  const name = req.body?.name;
  if (!name || !String(name).trim()) {
    throw new AppError(400, 'Название обязательно');
  }
  const { item, isNew } = await refService.paymentTypes.create(String(name));
  if (isNew) res.status(201).json(item);
  else res.json(item);
}

export async function getPaymentMethods(_req: Request, res: Response): Promise<void> {
  const rows = await refService.paymentMethods.list();
  res.json(rows);
}

export async function createPaymentMethod(req: Request, res: Response): Promise<void> {
  const name = req.body?.name;
  if (!name || !String(name).trim()) {
    throw new AppError(400, 'Название обязательно');
  }
  const { item, isNew } = await refService.paymentMethods.create(String(name));
  if (isNew) res.status(201).json(item);
  else res.json(item);
}

export async function getPromoTypes(_req: Request, res: Response): Promise<void> {
  const rows = await refService.promoTypes.list();
  res.json(rows);
}

export async function createPromoType(req: Request, res: Response): Promise<void> {
  const name = req.body?.name;
  if (!name || !String(name).trim()) {
    throw new AppError(400, 'Название обязательно');
  }
  const { item, isNew } = await refService.promoTypes.create(String(name));
  if (isNew) res.status(201).json(item);
  else res.json(item);
}

export async function getProviders(_req: Request, res: Response): Promise<void> {
  const rows = await refService.providers.list();
  res.json(rows);
}

export async function createProvider(req: Request, res: Response): Promise<void> {
  const name = req.body?.name;
  if (!name || !String(name).trim()) {
    throw new AppError(400, 'Название обязательно');
  }
  const { item, isNew } = await refService.providers.create(String(name));
  if (isNew) res.status(201).json(item);
  else res.json(item);
}

export async function deleteBonusName(req: Request, res: Response): Promise<void> {
  await refService.bonusNames.deleteById(Number(req.params.id));
  res.status(204).send();
}

export async function deletePaymentType(req: Request, res: Response): Promise<void> {
  await refService.paymentTypes.deleteById(Number(req.params.id));
  res.status(204).send();
}

export async function deletePaymentMethod(req: Request, res: Response): Promise<void> {
  await refService.paymentMethods.deleteById(Number(req.params.id));
  res.status(204).send();
}

export async function deletePromoType(req: Request, res: Response): Promise<void> {
  await refService.promoTypes.deleteById(Number(req.params.id));
  res.status(204).send();
}

export async function deleteProvider(req: Request, res: Response): Promise<void> {
  await refService.providers.deleteById(Number(req.params.id));
  res.status(204).send();
}
