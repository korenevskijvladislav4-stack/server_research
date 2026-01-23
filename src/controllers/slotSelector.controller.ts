import { Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../database/connection';
import { SlotSelector, CreateSlotSelectorDto, UpdateSlotSelectorDto } from '../models/SlotSelector';
import { AuthRequest } from '../middleware/auth.middleware';

/**
 * Get all selectors for a casino
 */
export const getSelectorsByCasino = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { casinoId } = req.params;
    const casinoIdNum = parseInt(casinoId, 10);
    
    if (isNaN(casinoIdNum)) {
      res.status(400).json({ error: 'Invalid casino ID' });
      return;
    }

    const connection = await pool.getConnection();
    const [rows] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM slot_selectors WHERE casino_id = ? ORDER BY geo ASC, category ASC',
      [casinoIdNum]
    );
    connection.release();

    res.json(rows as SlotSelector[]);
  } catch (error: any) {
    console.error('Error fetching selectors:', error);
    res.status(500).json({ 
      error: 'Failed to fetch selectors',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Create a new selector
 */
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

    const connection = await pool.getConnection();
    const [result] = await connection.query(
      'INSERT INTO slot_selectors (casino_id, geo, section, category, selector, url) VALUES (?, ?, ?, ?, ?, ?)',
      [data.casino_id, data.geo.toUpperCase(), data.section, data.category || null, data.selector, data.url || null]
    );
    const insertId = (result as any).insertId;
    
    const [newSelector] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM slot_selectors WHERE id = ?',
      [insertId]
    );
    connection.release();

    res.status(201).json(newSelector[0] as SlotSelector);
  } catch (error: any) {
    console.error('Error creating selector:', error);
    res.status(500).json({ 
      error: 'Failed to create selector',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Update a selector
 */
export const updateSelector = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const data: UpdateSlotSelectorDto = req.body;

    const connection = await pool.getConnection();
    
    const updates: string[] = [];
    const values: any[] = [];

    if (data.geo !== undefined) {
      updates.push('geo = ?');
      values.push(data.geo.toUpperCase());
    }
    if (data.section !== undefined) {
      updates.push('section = ?');
      values.push(data.section);
    }
    if (data.category !== undefined) {
      updates.push('category = ?');
      values.push(data.category || null);
    }
    if (data.selector !== undefined) {
      updates.push('selector = ?');
      values.push(data.selector);
    }
    if (data.url !== undefined) {
      updates.push('url = ?');
      values.push(data.url || null);
    }

    if (updates.length === 0) {
      connection.release();
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(id);
    await connection.query(
      `UPDATE slot_selectors SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );

    const [updated] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM slot_selectors WHERE id = ?',
      [id]
    );
    connection.release();

    if (updated && updated.length > 0) {
      res.json(updated[0] as SlotSelector);
    } else {
      res.status(404).json({ error: 'Selector not found' });
    }
  } catch (error: any) {
    console.error('Error updating selector:', error);
    res.status(500).json({ 
      error: 'Failed to update selector',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Delete a selector
 */
export const deleteSelector = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();
    
    await connection.query('DELETE FROM slot_selectors WHERE id = ?', [id]);
    connection.release();

    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting selector:', error);
    res.status(500).json({ 
      error: 'Failed to delete selector',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
