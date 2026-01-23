import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { RowDataPacket } from 'mysql2';
import pool from '../database/connection';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }

    const connection = await pool.getConnection();
    
    // Check if user exists
    const [existing] = await connection.query(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );

    if (Array.isArray(existing) && existing.length > 0) {
      connection.release();
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    await connection.query(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, hashedPassword]
    );

    connection.release();
    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const connection = await pool.getConnection();
    const [users] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    connection.release();

    if (Array.isArray(users) && users.length === 0) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = users[0] as any;
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const expiresIn = (process.env.JWT_EXPIRES_IN ?? '7d') as any;
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
};
