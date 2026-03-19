import { Response } from 'express';
import {
  CreateSlotSelectorDto,
  UpdateSlotSelectorDto,
  SlotSelector,
} from '../../models/Selector';
import { AuthRequest } from '../../middleware/auth.middleware';
import { AppError } from '../../errors/AppError';
import { slotSelectorService } from './selectors.service';

export const getSelectorsByCasino = async (req: AuthRequest, res: Response): Promise<void> => {
  const { casinoId } = req.params;
  const casinoIdNum = parseInt(casinoId, 10);

  if (isNaN(casinoIdNum)) {
    throw new AppError(400, 'Некорректный ID казино');
  }

  const selectors = await slotSelectorService.getSelectorsByCasino(casinoIdNum);
  res.json(selectors as SlotSelector[]);
};

export const createSelector = async (req: AuthRequest, res: Response): Promise<void> => {
  const { casinoId } = req.params;
  const data: CreateSlotSelectorDto = {
    ...req.body,
    casino_id: parseInt(casinoId, 10),
  };

  if (isNaN(data.casino_id)) {
    throw new AppError(400, 'Некорректный ID казино');
  }

  if (!data.geo || !data.section || !data.selector) {
    throw new AppError(400, 'GEO, раздел и селектор обязательны');
  }

  const selector = await slotSelectorService.createSelector(data);
  res.status(201).json(selector);
};

export const updateSelector = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const data: UpdateSlotSelectorDto = req.body;
  const selectorId = parseInt(id, 10);

  if (isNaN(selectorId)) {
    throw new AppError(400, 'Некорректный ID селектора');
  }

  const updated = await slotSelectorService.updateSelector(selectorId, data);
  if (!updated) {
    throw new AppError(404, 'Селектор не найден');
  }

  res.json(updated);
};

export const deleteSelector = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const selectorId = parseInt(id, 10);
  if (isNaN(selectorId)) {
    throw new AppError(400, 'Некорректный ID селектора');
  }

  await slotSelectorService.deleteSelector(selectorId);
  res.status(204).send();
};
