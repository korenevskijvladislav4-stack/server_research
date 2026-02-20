import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../database/connection';

// Bonus Names
export const getBonusNames = async (_req: Request, res: Response): Promise<void> => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM ref_bonus_names ORDER BY name'
    );
    connection.release();
    res.json(rows);
  } catch (error) {
    console.error('Error fetching bonus names:', error);
    res.status(500).json({ error: 'Failed to fetch bonus names' });
  }
};

export const createBonusName = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }
    
    const connection = await pool.getConnection();
    try {
      // Check if exists
      const [existing] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM ref_bonus_names WHERE name = ?',
        [name.trim()]
      );
      
      if (Array.isArray(existing) && existing.length > 0) {
        res.json(existing[0]);
        return;
      }
      
      const [result] = await connection.query(
        'INSERT INTO ref_bonus_names (name) VALUES (?)',
        [name.trim()]
      );
      
      const insertId = (result as any).insertId;
      const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM ref_bonus_names WHERE id = ?',
        [insertId]
      );
      
      res.status(201).json(rows[0]);
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error creating bonus name:', error);
    res.status(500).json({ error: 'Failed to create bonus name' });
  }
};

// Payment Types
export const getPaymentTypes = async (_req: Request, res: Response): Promise<void> => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM ref_payment_types ORDER BY name'
    );
    connection.release();
    res.json(rows);
  } catch (error) {
    console.error('Error fetching payment types:', error);
    res.status(500).json({ error: 'Failed to fetch payment types' });
  }
};

export const createPaymentType = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }
    
    const connection = await pool.getConnection();
    try {
      const [existing] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM ref_payment_types WHERE name = ?',
        [name.trim()]
      );
      
      if (Array.isArray(existing) && existing.length > 0) {
        res.json(existing[0]);
        return;
      }
      
      const [result] = await connection.query(
        'INSERT INTO ref_payment_types (name) VALUES (?)',
        [name.trim()]
      );
      
      const insertId = (result as any).insertId;
      const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM ref_payment_types WHERE id = ?',
        [insertId]
      );
      
      res.status(201).json(rows[0]);
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error creating payment type:', error);
    res.status(500).json({ error: 'Failed to create payment type' });
  }
};

// Payment Methods
export const getPaymentMethods = async (_req: Request, res: Response): Promise<void> => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM ref_payment_methods ORDER BY name'
    );
    connection.release();
    res.json(rows);
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json({ error: 'Failed to fetch payment methods' });
  }
};

export const createPaymentMethod = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }
    
    const connection = await pool.getConnection();
    try {
      const [existing] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM ref_payment_methods WHERE name = ?',
        [name.trim()]
      );
      
      if (Array.isArray(existing) && existing.length > 0) {
        res.json(existing[0]);
        return;
      }
      
      const [result] = await connection.query(
        'INSERT INTO ref_payment_methods (name) VALUES (?)',
        [name.trim()]
      );
      
      const insertId = (result as any).insertId;
      const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM ref_payment_methods WHERE id = ?',
        [insertId]
      );
      
      res.status(201).json(rows[0]);
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error creating payment method:', error);
    res.status(500).json({ error: 'Failed to create payment method' });
  }
};

// Promo types (tournament type)
export const getPromoTypes = async (_req: Request, res: Response): Promise<void> => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM ref_promo_types ORDER BY name'
    );
    connection.release();
    res.json(rows);
  } catch (error) {
    console.error('Error fetching promo types:', error);
    res.status(500).json({ error: 'Failed to fetch promo types' });
  }
};

export const createPromoType = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }
    const connection = await pool.getConnection();
    try {
      const [existing] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM ref_promo_types WHERE name = ?',
        [name.trim()]
      );
      if (Array.isArray(existing) && existing.length > 0) {
        res.json(existing[0]);
        return;
      }
      const [result] = await connection.query(
        'INSERT INTO ref_promo_types (name) VALUES (?)',
        [name.trim()]
      );
      const insertId = (result as any).insertId;
      const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM ref_promo_types WHERE id = ?',
        [insertId]
      );
      res.status(201).json(rows[0]);
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error creating promo type:', error);
    res.status(500).json({ error: 'Failed to create promo type' });
  }
};

// Providers (game/slot providers)
export const getProviders = async (_req: Request, res: Response): Promise<void> => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM providers ORDER BY name'
    );
    connection.release();
    res.json(rows);
  } catch (error) {
    console.error('Error fetching providers:', error);
    res.status(500).json({ error: 'Failed to fetch providers' });
  }
};

export const createProvider = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }
    const connection = await pool.getConnection();
    try {
      const [existing] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM providers WHERE name = ?',
        [name.trim()]
      );
      if (Array.isArray(existing) && existing.length > 0) {
        res.json(existing[0]);
        return;
      }
      const [result] = await connection.query(
        'INSERT INTO providers (name) VALUES (?)',
        [name.trim()]
      );
      const insertId = (result as any).insertId;
      const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM providers WHERE id = ?',
        [insertId]
      );
      res.status(201).json(rows[0]);
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error creating provider:', error);
    res.status(500).json({ error: 'Failed to create provider' });
  }
};
