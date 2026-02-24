import { Request, Response } from 'express';
import { refService } from './ref.service';
import { sendError } from '../../common/response';

export async function getBonusNames(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await refService.bonusNames.list();
    res.json(rows);
  } catch (e) {
    console.error('getBonusNames:', e);
    sendError(res, 500, 'Failed to fetch bonus names');
  }
}

export async function createBonusName(req: Request, res: Response): Promise<void> {
  try {
    const name = req.body?.name;
    if (!name || !String(name).trim()) {
      sendError(res, 400, 'Name is required');
      return;
    }
    const { item, isNew } = await refService.bonusNames.create(String(name));
    if (isNew) res.status(201).json(item);
    else res.json(item);
  } catch (e) {
    console.error('createBonusName:', e);
    sendError(res, 500, 'Failed to create bonus name');
  }
}

export async function getPaymentTypes(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await refService.paymentTypes.list();
    res.json(rows);
  } catch (e) {
    console.error('getPaymentTypes:', e);
    sendError(res, 500, 'Failed to fetch payment types');
  }
}

export async function createPaymentType(req: Request, res: Response): Promise<void> {
  try {
    const name = req.body?.name;
    if (!name || !String(name).trim()) {
      sendError(res, 400, 'Name is required');
      return;
    }
    const { item, isNew } = await refService.paymentTypes.create(String(name));
    if (isNew) res.status(201).json(item);
    else res.json(item);
  } catch (e) {
    console.error('createPaymentType:', e);
    sendError(res, 500, 'Failed to create payment type');
  }
}

export async function getPaymentMethods(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await refService.paymentMethods.list();
    res.json(rows);
  } catch (e) {
    console.error('getPaymentMethods:', e);
    sendError(res, 500, 'Failed to fetch payment methods');
  }
}

export async function createPaymentMethod(req: Request, res: Response): Promise<void> {
  try {
    const name = req.body?.name;
    if (!name || !String(name).trim()) {
      sendError(res, 400, 'Name is required');
      return;
    }
    const { item, isNew } = await refService.paymentMethods.create(String(name));
    if (isNew) res.status(201).json(item);
    else res.json(item);
  } catch (e) {
    console.error('createPaymentMethod:', e);
    sendError(res, 500, 'Failed to create payment method');
  }
}

export async function getPromoTypes(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await refService.promoTypes.list();
    res.json(rows);
  } catch (e) {
    console.error('getPromoTypes:', e);
    sendError(res, 500, 'Failed to fetch promo types');
  }
}

export async function createPromoType(req: Request, res: Response): Promise<void> {
  try {
    const name = req.body?.name;
    if (!name || !String(name).trim()) {
      sendError(res, 400, 'Name is required');
      return;
    }
    const { item, isNew } = await refService.promoTypes.create(String(name));
    if (isNew) res.status(201).json(item);
    else res.json(item);
  } catch (e) {
    console.error('createPromoType:', e);
    sendError(res, 500, 'Failed to create promo type');
  }
}

export async function getProviders(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await refService.providers.list();
    res.json(rows);
  } catch (e) {
    console.error('getProviders:', e);
    sendError(res, 500, 'Failed to fetch providers');
  }
}

export async function createProvider(req: Request, res: Response): Promise<void> {
  try {
    const name = req.body?.name;
    if (!name || !String(name).trim()) {
      sendError(res, 400, 'Name is required');
      return;
    }
    const { item, isNew } = await refService.providers.create(String(name));
    if (isNew) res.status(201).json(item);
    else res.json(item);
  } catch (e) {
    console.error('createProvider:', e);
    sendError(res, 500, 'Failed to create provider');
  }
}
