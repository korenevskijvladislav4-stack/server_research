/**
 * Promo controller
 */

import { Request, Response } from 'express';
import { promoService } from '../services/promo.service';
import { CreatePromoDto, UpdatePromoDto } from '../models/PromoCampaign';
import { parseQueryParams } from '../common/utils';

/**
 * Get all promos with pagination and filters
 */
export const getAllPromos = async (req: Request, res: Response): Promise<void> => {
  try {
    const params = parseQueryParams(req.query);
    const result = await promoService.findAll(params);
    res.json(result);
  } catch (error: any) {
    console.error('Error fetching promos:', error);
    res.status(500).json({
      error: 'Failed to fetch promos',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get promo by ID
 */
export const getPromoById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const promo = await promoService.findById(id);

    if (!promo) {
      res.status(404).json({ error: 'Promo campaign not found' });
      return;
    }

    res.json(promo);
  } catch (error: any) {
    console.error('Error fetching promo:', error);
    res.status(500).json({
      error: 'Failed to fetch promo campaign',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Create a new promo
 */
export const createPromo = async (req: Request, res: Response): Promise<void> => {
  try {
    const data: CreatePromoDto = req.body;

    if (!data.casino_id || !data.title) {
      res.status(400).json({ error: 'Casino ID and title are required' });
      return;
    }

    const userId = (req as any).user?.id;
    const promo = await promoService.create(data, userId);

    res.status(201).json(promo);
  } catch (error: any) {
    console.error('Error creating promo:', error);
    res.status(500).json({
      error: 'Failed to create promo campaign',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Update a promo
 */
export const updatePromo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const data: UpdatePromoDto = req.body;

    const promo = await promoService.update(id, data);

    if (!promo) {
      res.status(404).json({ error: 'Promo campaign not found' });
      return;
    }

    res.json(promo);
  } catch (error: any) {
    console.error('Error updating promo:', error);
    res.status(500).json({
      error: 'Failed to update promo campaign',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Delete a promo
 */
export const deletePromo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const deleted = await promoService.delete(id);

    if (!deleted) {
      res.status(404).json({ error: 'Promo campaign not found' });
      return;
    }

    res.json({ message: 'Promo campaign deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting promo:', error);
    res.status(500).json({
      error: 'Failed to delete promo campaign',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
