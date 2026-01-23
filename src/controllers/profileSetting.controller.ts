import { Request, Response } from 'express';
import pool from '../database/connection';
import { RowDataPacket } from 'mysql2';
import {
  ProfileSetting,
  ProfileSettingValue,
} from '../models/ProfileSetting';

// Get all profile settings for a specific casino and geo
export const getCasinoProfileSettings = async (req: Request, res: Response) => {
  try {
    const { casinoId } = req.params;
    const { geo } = req.query;

    let query = 'SELECT * FROM profile_settings WHERE casino_id = ?';
    const params: any[] = [casinoId];

    if (geo) {
      query += ' AND geo = ?';
      params.push(geo);
    }

    const [rows] = await pool.query<(ProfileSetting & RowDataPacket)[]>(query, params);

    return res.json(rows);
  } catch (error) {
    console.error('Error fetching casino profile settings:', error);
    return res.status(500).json({ message: 'Failed to fetch casino profile settings' });
  }
};

// Update or create a profile setting value
export const updateProfileSetting = async (req: Request, res: Response) => {
  try {
    const { casinoId } = req.params;
    const { geo, field_id, context_id, value } = req.body;

    if (!geo || field_id === undefined || context_id === undefined || value === undefined) {
      return res.status(400).json({ message: 'geo, field_id, context_id, and value are required' });
    }

    // Use INSERT ... ON DUPLICATE KEY UPDATE to handle both insert and update
    await pool.query(
      `INSERT INTO profile_settings (casino_id, geo, field_id, context_id, value)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = CURRENT_TIMESTAMP`,
      [casinoId, geo, field_id, context_id, value]
    );

    // Fetch the updated/created setting
    const [rows] = await pool.query<(ProfileSetting & RowDataPacket)[]>(
      'SELECT * FROM profile_settings WHERE casino_id = ? AND geo = ? AND field_id = ? AND context_id = ?',
      [casinoId, geo, field_id, context_id]
    );

    return res.json(rows[0]);
  } catch (error) {
    console.error('Error updating profile setting:', error);
    return res.status(500).json({ message: 'Failed to update profile setting' });
  }
};

// Batch update multiple profile settings for a casino and geo
export const batchUpdateProfileSettings = async (req: Request, res: Response) => {
  try {
    const { casinoId } = req.params;
    const { geo, settings } = req.body as { geo: string; settings: ProfileSettingValue[] };

    if (!geo || !Array.isArray(settings) || settings.length === 0) {
      return res.status(400).json({ message: 'geo and settings array are required' });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      for (const setting of settings) {
        await connection.query(
          `INSERT INTO profile_settings (casino_id, geo, field_id, context_id, value)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = CURRENT_TIMESTAMP`,
          [casinoId, geo, setting.field_id, setting.context_id, setting.value]
        );
      }

      await connection.commit();

      // Fetch all settings for this casino and geo
      const [rows] = await connection.query<(ProfileSetting & RowDataPacket)[]>(
        'SELECT * FROM profile_settings WHERE casino_id = ? AND geo = ?',
        [casinoId, geo]
      );

      return res.json(rows);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error batch updating profile settings:', error);
    return res.status(500).json({ message: 'Failed to batch update profile settings' });
  }
};

// Get aggregated profile settings with casino names (for analytics page)
export const getAggregatedProfileSettings = async (req: Request, res: Response) => {
  try {
    const { geo, casino_ids } = req.query;

    // Build WHERE clause
    const conditions: string[] = ['ps.value = 1'];
    const params: any[] = [];

    if (geo) {
      conditions.push('ps.geo = ?');
      params.push(geo);
    }

    if (casino_ids) {
      const ids = String(casino_ids).split(',').map(Number).filter(n => !isNaN(n));
      if (ids.length > 0) {
        conditions.push(`ps.casino_id IN (${ids.map(() => '?').join(',')})`);
        params.push(...ids);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get all settings with casino names grouped by field_id and context_id
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
        ps.field_id,
        ps.context_id,
        ps.geo,
        c.id as casino_id,
        c.name as casino_name
       FROM profile_settings ps
       JOIN casinos c ON c.id = ps.casino_id
       ${whereClause}
       ORDER BY ps.field_id, ps.context_id, c.name`,
      params
    );

    // Group by field_id and context_id
    const grouped: Record<string, { 
      field_id: number; 
      context_id: number; 
      casinos: Array<{ id: number; name: string; geo: string }>;
      count: number;
    }> = {};

    for (const row of rows) {
      const key = `${row.field_id}_${row.context_id}`;
      if (!grouped[key]) {
        grouped[key] = {
          field_id: row.field_id,
          context_id: row.context_id,
          casinos: [],
          count: 0,
        };
      }
      grouped[key].casinos.push({
        id: row.casino_id,
        name: row.casino_name,
        geo: row.geo,
      });
      grouped[key].count++;
    }

    return res.json(Object.values(grouped));
  } catch (error) {
    console.error('Error fetching aggregated profile settings:', error);
    return res.status(500).json({ message: 'Failed to fetch aggregated profile settings' });
  }
};
