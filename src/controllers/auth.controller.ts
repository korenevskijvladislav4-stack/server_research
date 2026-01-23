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

    console.log('Login attempt for email:', email);

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Проверка JWT_SECRET
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your-secret-key') {
      console.error('JWT_SECRET is not set or using default value');
      res.status(500).json({ 
        error: 'Server configuration error',
        message: 'JWT_SECRET is not properly configured'
      });
      return;
    }

    let connection;
    try {
      connection = await pool.getConnection();
      console.log('Database connection acquired');
    } catch (dbError: any) {
      console.error('Database connection error:', dbError);
      res.status(500).json({ 
        error: 'Database connection failed',
        message: dbError.message || 'Unable to connect to database'
      });
      return;
    }

    try {
      const [users] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM users WHERE email = ?',
        [email]
      );

      if (Array.isArray(users) && users.length === 0) {
        connection.release();
        console.log('User not found:', email);
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const user = users[0] as any;
      console.log('User found:', { id: user.id, email: user.email, hasPassword: !!user.password });

      // Проверка наличия поля password
      if (!user.password) {
        connection.release();
        console.error('User password field is missing');
        res.status(500).json({ 
          error: 'User data error',
          message: 'Password field is missing in user record'
        });
        return;
      }

      const isValidPassword = await bcrypt.compare(password, user.password);

      if (!isValidPassword) {
        connection.release();
        console.log('Invalid password for user:', email);
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const expiresIn = (process.env.JWT_EXPIRES_IN ?? '7d') as any;
      
      try {
        const token = jwt.sign(
          { id: user.id, email: user.email, role: user.role || 'user' },
          JWT_SECRET,
          { expiresIn }
        );

        connection.release();
        console.log('Login successful for user:', email);

        res.json({
          token,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role || 'user'
          }
        });
      } catch (jwtError: any) {
        connection.release();
        console.error('JWT signing error:', jwtError);
        res.status(500).json({ 
          error: 'Token generation failed',
          message: jwtError.message || 'Unable to generate authentication token'
        });
      }
    } catch (queryError: any) {
      connection.release();
      console.error('Database query error:', queryError);
      res.status(500).json({ 
        error: 'Database query failed',
        message: queryError.message || 'Unable to query user data'
      });
    }
  } catch (error: any) {
    console.error('Unexpected error in login:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message || 'Something went wrong',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
};
