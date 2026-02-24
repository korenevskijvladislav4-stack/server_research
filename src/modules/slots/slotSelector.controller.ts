import { Response } from 'express';
import {
  CreateSlotSelectorDto,
  UpdateSlotSelectorDto,
  SlotSelector,
} from '../../models/SlotSelector';
import { AuthRequest } from '../../middleware/auth.middleware';
import { slotSelectorService } from './slotSelector.service';

export const getSelectorsByCasino = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { casinoId } = req.params;
    const casinoIdNum = parseInt(casinoId, 10);

    if (isNaN(casinoIdNum)) {
      res.status(400).json({ error: 'Invalid casino ID' });
      return;
    }

    const selectors = await slotSelectorService.getSelectorsByCasino(casinoIdNum);
    res.json(selectors as SlotSelector[]);
  } catch (error: any) {
    console.error('Error fetching selectors:', error);
    res.status(500).json({
      error: 'Failed to fetch selectors',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const createSelector = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { casinoId } = req.params;
    const data: CreateSlotSelectorDto = {
      ...req.body,
      casino_id: parseInt(casinoId, 10),
    };

    if (isNaN(data.casino_id)) {
      res.status(400).json({ error: 'Invalid casino ID' });
      return;
    }

    if (!data.geo || !data.section || !data.selector) {
      res.status(400).json({ error: 'GEO, section, and selector are required' });
      return;
    }

    const selector = await slotSelectorService.createSelector(data);
    res.status(201).json(selector);
  } catch (error: any) {
    console.error('Error creating selector:', error);
    res.status(500).json({
      error: 'Failed to create selector',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const updateSelector = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const data: UpdateSlotSelectorDto = req.body;
    const selectorId = parseInt(id, 10);

    if (isNaN(selectorId)) {
      res.status(400).json({ error: 'Invalid selector id' });
      return;
    }

    const updated = await slotSelectorService.updateSelector(selectorId, data);
    if (!updated) {
      res.status(404).json({ error: 'Selector not found' });
      return;
    }

    res.json(updated);
  } catch (error: any) {
    console.error('Error updating selector:', error);
    res.status(500).json({
      error: 'Failed to update selector',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const deleteSelector = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const selectorId = parseInt(id, 10);
    if (isNaN(selectorId)) {
      res.status(400).json({ error: 'Invalid selector id' });
      return;
    }

    await slotSelectorService.deleteSelector(selectorId);
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting selector:', error);
    res.status(500).json({
      error: 'Failed to delete selector',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

