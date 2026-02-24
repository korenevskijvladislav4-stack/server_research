import { Request, Response } from 'express';
import pool from '../database/connection';

export async function healthCheck(_req: Request, res: Response): Promise<void> {
  try {
    const conn = await pool.getConnection();
    try {
      await conn.query('SELECT 1');
      res.json({ status: 'ok', message: 'Server is running', database: 'connected' });
    } finally {
      conn.release();
    }
  } catch {
    res.status(503).json({
      status: 'error',
      message: 'Service Unavailable',
      database: 'disconnected',
    });
  }
}
