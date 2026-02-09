import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../database/connection';

// -----------------------------------------------------------------------
// List history for a casino (audit log)
// -----------------------------------------------------------------------
export const listHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { casinoId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const [countResult] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) as total FROM casino_profile_history WHERE casino_id = ?',
      [casinoId],
    );
    const total = (countResult[0] as any).total;

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT h.*,
              u.username AS actor_username,
              f.label    AS field_label,
              f.key_name AS field_key
       FROM casino_profile_history h
       LEFT JOIN users u ON u.id = h.actor_user_id
       LEFT JOIN casino_profile_fields f ON f.id = h.field_id
       WHERE h.casino_id = ?
       ORDER BY h.created_at DESC
       LIMIT ? OFFSET ?`,
      [casinoId, limit, offset],
    );

    res.json({ data: rows, total, limit, offset });
  } catch (error) {
    console.error('Error listing casino history:', error);
    res.status(500).json({ error: 'Failed to list history' });
  }
};
