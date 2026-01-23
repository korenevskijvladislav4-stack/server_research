import { Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../database/connection';
import { CasinoAccount, CreateCasinoAccountDto, UpdateCasinoAccountDto } from '../models/CasinoAccount';
import { AuthRequest } from '../middleware/auth.middleware';

export const getAllCasinoAccounts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { casino_id, geo, owner_id, search } = (req.query ?? {}) as any;

    const connection = await pool.getConnection();

    const conditions: string[] = [];
    const params: any[] = [];

    if (casino_id) {
      conditions.push('ca.casino_id = ?');
      params.push(Number(casino_id));
    }
    if (geo) {
      conditions.push('ca.geo = ?');
      params.push(String(geo));
    }
    if (owner_id) {
      conditions.push('ca.owner_id = ?');
      params.push(Number(owner_id));
    }
    if (search) {
      conditions.push(
        '(c.name LIKE ? OR ca.email LIKE ? OR ca.phone LIKE ? OR ca.password LIKE ? OR u.username LIKE ?)'
      );
      const s = `%${String(search)}%`;
      params.push(s, s, s, s, s);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT ca.*, c.name as casino_name, u.username as owner_username
       FROM casino_accounts ca
       LEFT JOIN casinos c ON ca.casino_id = c.id
       LEFT JOIN users u ON ca.owner_id = u.id
       ${whereClause}
       ORDER BY ca.last_modified_at DESC, ca.created_at DESC`,
      params
    );

    connection.release();
    res.json(rows as unknown as CasinoAccount[]);
  } catch (error) {
    console.error('Error fetching all casino accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
};

export const getCasinoAccounts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { casinoId } = req.params;
    const connection = await pool.getConnection();

    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT ca.*, u.username as owner_username
       FROM casino_accounts ca
       LEFT JOIN users u ON ca.owner_id = u.id
       WHERE ca.casino_id = ?
       ORDER BY ca.created_at DESC`,
      [casinoId]
    );

    connection.release();
    res.json(rows as unknown as CasinoAccount[]);
  } catch (error) {
    console.error('Error fetching casino accounts:', error);
    res.status(500).json({ error: 'Failed to fetch casino accounts' });
  }
};

export const createCasinoAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { casinoId } = req.params;
    const { geo, email, phone, password, owner_id }: CreateCasinoAccountDto = req.body;

    if (!geo || !password) {
      res.status(400).json({ error: 'GEO and password are required' });
      return;
    }

    const connection = await pool.getConnection();

    const [result] = await connection.query(
      `INSERT INTO casino_accounts (casino_id, geo, email, phone, password, owner_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [casinoId, geo, email || null, phone || null, password, owner_id || null]
    );

    const insertId = (result as any).insertId;

    const [newAccount] = await connection.query<RowDataPacket[]>(
      `SELECT ca.*, u.username as owner_username
       FROM casino_accounts ca
       LEFT JOIN users u ON ca.owner_id = u.id
       WHERE ca.id = ?`,
      [insertId]
    );

    connection.release();
    res.status(201).json((newAccount as unknown as CasinoAccount[])[0]);
  } catch (error) {
    console.error('Error creating casino account:', error);
    res.status(500).json({ error: 'Failed to create casino account' });
  }
};

export const updateCasinoAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { geo, email, phone, password, owner_id }: UpdateCasinoAccountDto = req.body;

    const connection = await pool.getConnection();

    const updates: string[] = [];
    const values: any[] = [];

    if (geo !== undefined) {
      updates.push('geo = ?');
      values.push(geo);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email || null);
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      values.push(phone || null);
    }
    if (password !== undefined) {
      updates.push('password = ?');
      values.push(password);
    }
    if (owner_id !== undefined) {
      updates.push('owner_id = ?');
      values.push(owner_id || null);
    }

    if (updates.length === 0) {
      connection.release();
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(id);

    await connection.query(
      `UPDATE casino_accounts SET ${updates.join(', ')}, last_modified_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );

    const [updated] = await connection.query<RowDataPacket[]>(
      `SELECT ca.*, u.username as owner_username
       FROM casino_accounts ca
       LEFT JOIN users u ON ca.owner_id = u.id
       WHERE ca.id = ?`,
      [id]
    );

    connection.release();
    res.json((updated as unknown as CasinoAccount[])[0]);
  } catch (error) {
    console.error('Error updating casino account:', error);
    res.status(500).json({ error: 'Failed to update casino account' });
  }
};

export const deleteCasinoAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    await connection.query('DELETE FROM casino_accounts WHERE id = ?', [id]);

    connection.release();
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting casino account:', error);
    res.status(500).json({ error: 'Failed to delete casino account' });
  }
};
