import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../database/connection';
import { Geo } from '../models/Geo';

export const getGeos = async (_req: Request, res: Response): Promise<void> => {
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<RowDataPacket[]>(
        'SELECT * FROM geos WHERE is_active = TRUE ORDER BY sort_order, code'
      );
      res.json(rows as unknown as Geo[]);
    } finally {
      conn.release();
    }
  } catch (e: any) {
    console.error('getGeos error:', e);
    res.status(500).json({ error: 'Failed to fetch geos' });
  }
};

export const createGeo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, name } = req.body;
    if (!code) {
      res.status(400).json({ error: 'code is required' });
      return;
    }

    const conn = await pool.getConnection();
    try {
      // Check if geo with this code already exists
      const [existing] = await conn.query<RowDataPacket[]>(
        'SELECT id FROM geos WHERE code = ?',
        [code.toUpperCase()]
      );

      if (Array.isArray(existing) && existing.length > 0) {
        // Return existing geo
        const [rows] = await conn.query<RowDataPacket[]>(
          'SELECT * FROM geos WHERE code = ?',
          [code.toUpperCase()]
        );
        res.json((rows as unknown as Geo[])[0]);
        return;
      }

      // Create new geo
      const [result] = await conn.query(
        'INSERT INTO geos (code, name, is_active, sort_order) VALUES (?, ?, TRUE, 0)',
        [code.toUpperCase(), name || code.toUpperCase()]
      );

      const insertId = (result as any).insertId;
      const [newGeo] = await conn.query<RowDataPacket[]>(
        'SELECT * FROM geos WHERE id = ?',
        [insertId]
      );

      res.status(201).json((newGeo as unknown as Geo[])[0]);
    } finally {
      conn.release();
    }
  } catch (e: any) {
    console.error('createGeo error:', e);
    res.status(500).json({ error: 'Failed to create geo' });
  }
};

