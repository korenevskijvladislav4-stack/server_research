/**
 * Casino controller
 */

import { Request, Response } from 'express';
import { casinoService } from '../services/casino.service';
import { CreateCasinoDto, UpdateCasinoDto } from '../models/Casino';
import { parseQueryParams } from '../common/utils';

/**
 * Get all casinos with pagination and filters
 */
export const getAllCasinos = async (req: Request, res: Response): Promise<void> => {
  try {
    const params = parseQueryParams(req.query);
    const result = await casinoService.findAll(params);
    res.json(result);
  } catch (error: any) {
    console.error('Error fetching casinos:', error);
    res.status(500).json({ 
      error: 'Failed to fetch casinos',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get casino by ID
 */
export const getCasinoById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const casino = await casinoService.findById(id);

    if (!casino) {
      res.status(404).json({ error: 'Casino not found' });
      return;
    }

    res.json(casino);
  } catch (error: any) {
    console.error('Error fetching casino:', error);
    res.status(500).json({ 
      error: 'Failed to fetch casino',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Create a new casino
 */
export const createCasino = async (req: Request, res: Response): Promise<void> => {
  try {
    const data: CreateCasinoDto = req.body;

    if (!data.name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const userId = (req as any).user?.id;
    const casino = await casinoService.create(data, userId);
    
    res.status(201).json(casino);
  } catch (error: any) {
    console.error('Error creating casino:', error);
    res.status(500).json({
      error: 'Failed to create casino',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Update a casino
 */
export const updateCasino = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const data: UpdateCasinoDto = req.body;

    const casino = await casinoService.update(id, data);

    if (!casino) {
      res.status(404).json({ error: 'Casino not found' });
      return;
    }

    res.json(casino);
  } catch (error: any) {
    console.error('Error updating casino:', error);
    res.status(500).json({
      error: 'Failed to update casino',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Delete a casino
 */
export const deleteCasino = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const deleted = await casinoService.delete(id);

    if (!deleted) {
      res.status(404).json({ error: 'Casino not found' });
      return;
    }

    res.json({ message: 'Casino deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting casino:', error);
    res.status(500).json({ 
      error: 'Failed to delete casino',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
