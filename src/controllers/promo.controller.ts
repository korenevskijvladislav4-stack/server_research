import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../database/connection';
import { PromoCampaign, CreatePromoDto, UpdatePromoDto } from '../models/PromoCampaign';

export const getAllPromos = async (req: Request, res: Response): Promise<void> => {
  try {
    const { casino_id, geo } = req.query;
    const connection = await pool.getConnection();
    
    let query = 'SELECT * FROM promo_campaigns';
    const conditions: string[] = [];
    const params: any[] = [];

    if (casino_id) {
      conditions.push('casino_id = ?');
      params.push(casino_id);
    }
    if (geo) {
      conditions.push('geo = ?');
      params.push(geo);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    const [rows] = await connection.query<RowDataPacket[]>(query, params);
    connection.release();
    res.json(rows as unknown as PromoCampaign[]);
  } catch (error) {
    console.error('Error fetching promos:', error);
    res.status(500).json({ error: 'Failed to fetch promos' });
  }
};

export const getPromoById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();
    const [rows] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM promo_campaigns WHERE id = ?',
      [id]
    );
    connection.release();

    if (Array.isArray(rows) && rows.length === 0) {
      res.status(404).json({ error: 'Promo campaign not found' });
      return;
    }

    res.json((rows as unknown as PromoCampaign[])[0]);
  } catch (error) {
    console.error('Error fetching promo:', error);
    res.status(500).json({ error: 'Failed to fetch promo campaign' });
  }
};

export const createPromo = async (req: Request, res: Response): Promise<void> => {
  try {
    const data: CreatePromoDto = req.body;
    const connection = await pool.getConnection();
    
    const [result] = await connection.query(
      `INSERT INTO promo_campaigns 
       (casino_id, geo, title, description, start_date, end_date, promo_code, bonus_type, bonus_amount, wagering_requirement, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.casino_id,
        data.geo || null,
        data.title,
        data.description || null,
        data.start_date || null,
        data.end_date || null,
        data.promo_code || null,
        data.bonus_type || null,
        data.bonus_amount || null,
        data.wagering_requirement || null,
        data.status || 'upcoming',
        (req as any).user?.id || null
      ]
    );

    const insertId = (result as any).insertId;
    const [newPromo] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM promo_campaigns WHERE id = ?',
      [insertId]
    );
    
    connection.release();
    res.status(201).json((newPromo as unknown as PromoCampaign[])[0]);
  } catch (error) {
    console.error('Error creating promo:', error);
    res.status(500).json({ error: 'Failed to create promo campaign' });
  }
};

export const updatePromo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const data: UpdatePromoDto = req.body;
    const connection = await pool.getConnection();

    const updateFields: string[] = [];
    const values: any[] = [];

    Object.keys(data).forEach((key) => {
      if (data[key as keyof UpdatePromoDto] !== undefined) {
        updateFields.push(`${key} = ?`);
        values.push(data[key as keyof UpdatePromoDto]);
      }
    });

    if (updateFields.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(id);

    await connection.query(
      `UPDATE promo_campaigns SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    );

    const [updated] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM promo_campaigns WHERE id = ?',
      [id]
    );

    connection.release();
    res.json((updated as unknown as PromoCampaign[])[0]);
  } catch (error) {
    console.error('Error updating promo:', error);
    res.status(500).json({ error: 'Failed to update promo campaign' });
  }
};

export const deletePromo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();
    
    await connection.query('DELETE FROM promo_campaigns WHERE id = ?', [id]);
    connection.release();
    
    res.json({ message: 'Promo campaign deleted successfully' });
  } catch (error) {
    console.error('Error deleting promo:', error);
    res.status(500).json({ error: 'Failed to delete promo campaign' });
  }
};
