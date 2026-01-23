import { Response } from 'express';
import { RowDataPacket } from 'mysql2';
import bcrypt from 'bcryptjs';
import pool from '../database/connection';
import { AuthRequest } from '../middleware/auth.middleware';

export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CreateUserDto {
  username: string;
  email: string;
  password: string;
  role?: 'admin' | 'user';
  is_active?: boolean;
}

export interface UpdateUserDto {
  username?: string;
  email?: string;
  password?: string;
  role?: 'admin' | 'user';
  is_active?: boolean;
}

export const getAllUsers = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const connection = await pool.getConnection();

    const [rows] = await connection.query<RowDataPacket[]>(
      'SELECT id, username, email, role, is_active, created_at, updated_at FROM users ORDER BY username'
    );

    connection.release();
    res.json(rows as unknown as User[]);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

export const createUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { username, email, password, role = 'user', is_active = true }: CreateUserDto = req.body;

    if (!username || !email || !password) {
      res.status(400).json({ error: 'Username, email and password are required' });
      return;
    }

    const connection = await pool.getConnection();

    // Check if user exists
    const [existing] = await connection.query<RowDataPacket[]>(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );

    if (Array.isArray(existing) && existing.length > 0) {
      connection.release();
      res.status(400).json({ error: 'User with this email or username already exists' });
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const [result] = await connection.query(
      'INSERT INTO users (username, email, password, role, is_active) VALUES (?, ?, ?, ?, ?)',
      [username, email, hashedPassword, role, is_active]
    );

    const insertId = (result as any).insertId;

    const [newUser] = await connection.query<RowDataPacket[]>(
      'SELECT id, username, email, role, is_active, created_at, updated_at FROM users WHERE id = ?',
      [insertId]
    );

    connection.release();
    res.status(201).json((newUser as unknown as User[])[0]);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
};

export const updateUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { username, email, password, role, is_active }: UpdateUserDto = req.body;

    const connection = await pool.getConnection();

    // Check if user exists
    const [existing] = await connection.query<RowDataPacket[]>(
      'SELECT id FROM users WHERE id = ?',
      [id]
    );

    if (Array.isArray(existing) && existing.length === 0) {
      connection.release();
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Check if email or username is already taken by another user
    if (email || username) {
      const [duplicate] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM users WHERE (email = ? OR username = ?) AND id != ?',
        [email || '', username || '', id]
      );

      if (Array.isArray(duplicate) && duplicate.length > 0) {
        connection.release();
        res.status(400).json({ error: 'Email or username already taken by another user' });
        return;
      }
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (username !== undefined) {
      updates.push('username = ?');
      values.push(username);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email);
    }
    if (password !== undefined) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push('password = ?');
      values.push(hashedPassword);
    }
    if (role !== undefined) {
      updates.push('role = ?');
      values.push(role);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active);
    }

    if (updates.length === 0) {
      connection.release();
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(id);

    await connection.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const [updated] = await connection.query<RowDataPacket[]>(
      'SELECT id, username, email, role, is_active, created_at, updated_at FROM users WHERE id = ?',
      [id]
    );

    connection.release();
    res.json((updated as unknown as User[])[0]);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    // Check if user exists
    const [existing] = await connection.query<RowDataPacket[]>(
      'SELECT id FROM users WHERE id = ?',
      [id]
    );

    if (Array.isArray(existing) && existing.length === 0) {
      connection.release();
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Instead of deleting, deactivate the user
    await connection.query('UPDATE users SET is_active = FALSE WHERE id = ?', [id]);

    connection.release();
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};
