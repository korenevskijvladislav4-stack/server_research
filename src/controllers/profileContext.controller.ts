import { Request, Response } from 'express';
import pool from '../database/connection';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import {
  ProfileContext,
  CreateProfileContextDto,
  UpdateProfileContextDto,
} from '../models/ProfileContext';

export const getAllProfileContexts = async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<(ProfileContext & RowDataPacket)[]>(
      'SELECT * FROM profile_contexts ORDER BY sort_order ASC, name ASC'
    );
    return res.json(rows);
  } catch (error) {
    console.error('Error fetching profile contexts:', error);
    return res.status(500).json({ message: 'Failed to fetch profile contexts' });
  }
};

export const getProfileContextById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query<(ProfileContext & RowDataPacket)[]>(
      'SELECT * FROM profile_contexts WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Profile context not found' });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching profile context:', error);
    return res.status(500).json({ message: 'Failed to fetch profile context' });
  }
};

export const createProfileContext = async (req: Request, res: Response) => {
  try {
    const data: CreateProfileContextDto = req.body;

    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO profile_contexts (name, sort_order, is_active) VALUES (?, ?, ?)',
      [data.name, data.sort_order || 0, data.is_active !== false]
    );

    const [rows] = await pool.query<(ProfileContext & RowDataPacket)[]>(
      'SELECT * FROM profile_contexts WHERE id = ?',
      [result.insertId]
    );

    return res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error creating profile context:', error);
    return res.status(500).json({ message: 'Failed to create profile context' });
  }
};

export const updateProfileContext = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data: UpdateProfileContextDto = req.body;

    const updates: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.sort_order !== undefined) {
      updates.push('sort_order = ?');
      values.push(data.sort_order);
    }
    if (data.is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(data.is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    values.push(id);

    await pool.query(
      `UPDATE profile_contexts SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const [rows] = await pool.query<(ProfileContext & RowDataPacket)[]>(
      'SELECT * FROM profile_contexts WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Profile context not found' });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error('Error updating profile context:', error);
    return res.status(500).json({ message: 'Failed to update profile context' });
  }
};

export const deleteProfileContext = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [result] = await pool.query<ResultSetHeader>(
      'DELETE FROM profile_contexts WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Profile context not found' });
    }

    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting profile context:', error);
    return res.status(500).json({ message: 'Failed to delete profile context' });
  }
};
