import { Request, Response } from 'express';
import pool from '../database/connection';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import {
  ProfileField,
  CreateProfileFieldDto,
  UpdateProfileFieldDto,
} from '../models/ProfileField';


export const getAllProfileFields = async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<(ProfileField & RowDataPacket)[]>(
      'SELECT * FROM profile_fields ORDER BY sort_order ASC, name ASC'
    );
    return res.json(rows);
  } catch (error) {
    console.error('Error fetching profile fields:', error);
    return res.status(500).json({ message: 'Failed to fetch profile fields' });
  }
};

export const getProfileFieldById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query<(ProfileField & RowDataPacket)[]>(
      'SELECT * FROM profile_fields WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Profile field not found' });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching profile field:', error);
    return res.status(500).json({ message: 'Failed to fetch profile field' });
  }
};

export const createProfileField = async (req: Request, res: Response) => {
  try {
    const data: CreateProfileFieldDto = req.body;

    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO profile_fields (name, sort_order, is_active) VALUES (?, ?, ?)',
      [data.name, data.sort_order || 0, data.is_active !== false]
    );

    const [rows] = await pool.query<(ProfileField & RowDataPacket)[]>(
      'SELECT * FROM profile_fields WHERE id = ?',
      [result.insertId]
    );

    return res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error creating profile field:', error);
    return res.status(500).json({ message: 'Failed to create profile field' });
  }
};

export const updateProfileField = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data: UpdateProfileFieldDto = req.body;

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
      `UPDATE profile_fields SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const [rows] = await pool.query<(ProfileField & RowDataPacket)[]>(
      'SELECT * FROM profile_fields WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Profile field not found' });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error('Error updating profile field:', error);
    return res.status(500).json({ message: 'Failed to update profile field' });
  }
};

export const deleteProfileField = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [result] = await pool.query<ResultSetHeader>(
      'DELETE FROM profile_fields WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Profile field not found' });
    }

    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting profile field:', error);
    return res.status(500).json({ message: 'Failed to delete profile field' });
  }
};
