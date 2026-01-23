import { Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../database/connection';
import { Slot } from '../models/Slot';
import { SlotParserProxyService } from '../services/slot-parser-proxy.service';
import { getProxyConfig } from '../config/proxy.config';
import { AuthRequest } from '../middleware/auth.middleware';

const parserService = new SlotParserProxyService();

// Инициализируем прокси при старте
const proxyConfig = getProxyConfig();
parserService.setGeoProxies(proxyConfig);

/**
 * Get all slots for a casino (optionally filtered by GEO)
 */
export const getSlotsByCasino = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { casinoId } = req.params;
    const { geo: geoFilter } = req.query;
    
    const casinoIdNum = parseInt(casinoId, 10);
    if (isNaN(casinoIdNum)) {
      res.status(400).json({ error: 'Invalid casino ID' });
      return;
    }

    const connection = await pool.getConnection();

    let query = `SELECT * FROM slots WHERE casino_id = ?`;
    const params: any[] = [casinoIdNum];

    if (geoFilter) {
      query += ` AND geo = ?`;
      params.push(String(geoFilter).toUpperCase());
    }

    query += ` ORDER BY geo ASC, is_featured DESC, is_popular DESC, is_new DESC, name ASC`;

    const [rows] = await connection.query<RowDataPacket[]>(query, params);
    connection.release();

    // Parse JSON fields
    const slots = (rows as any[]).map((row) => ({
      ...row,
      features: row.features ? (typeof row.features === 'string' ? JSON.parse(row.features) : row.features) : null,
      tags: row.tags ? (typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags) : null,
    })) as Slot[];

    res.json(slots);
  } catch (error: any) {
    console.error('Error fetching slots:', error);
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
      errno: error?.errno,
      sqlState: error?.sqlState,
      sqlMessage: error?.sqlMessage,
    });
    res.status(500).json({ 
      error: 'Failed to fetch slots',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Parse slots from casino homepage for multiple GEOs
 */
export const parseSlotsFromCasino = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { casinoId } = req.params;
    const { url, geos } = req.body;

    if (!url) {
      res.status(400).json({ error: 'URL is required' });
      return;
    }

    if (!geos || !Array.isArray(geos) || geos.length === 0) {
      res.status(400).json({ error: 'GEOs array is required' });
      return;
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      res.status(400).json({ error: 'Invalid URL format' });
      return;
    }

    // Get casino to verify it exists
    const connection = await pool.getConnection();
    const [casinoRows] = await connection.query<RowDataPacket[]>(
      'SELECT id, website FROM casinos WHERE id = ?',
      [casinoId]
    );

    if (!Array.isArray(casinoRows) || casinoRows.length === 0) {
      connection.release();
      res.status(404).json({ error: 'Casino not found' });
      return;
    }

    connection.release();

    // Parse slots for all GEOs
    console.log(`Parsing slots from ${url} for casino ${casinoId}, GEOs: ${geos.join(', ')}`);
    const results = await parserService.parseSlotsForMultipleGeos(
      url,
      parseInt(casinoId),
      geos.map((g: string) => g.toUpperCase())
    );

    // Save slots to database
    const savedSlots: Slot[] = [];
    const connection2 = await pool.getConnection();

    try {
      for (const { slots } of results) {
        for (const slotData of slots) {
          // Check if slot already exists (by name, casino and geo)
          const [existing] = await connection2.query<RowDataPacket[]>(
            'SELECT id FROM slots WHERE casino_id = ? AND geo = ? AND name = ?',
            [slotData.casino_id, slotData.geo, slotData.name]
          );

          if (Array.isArray(existing) && existing.length > 0) {
            // Update existing slot
            const updates: string[] = [];
            const values: any[] = [];

            if (slotData.provider !== undefined) {
              updates.push('provider = ?');
              values.push(slotData.provider);
            }
            if (slotData.image_url !== undefined) {
              updates.push('image_url = ?');
              values.push(slotData.image_url);
            }
            if (slotData.description !== undefined) {
              updates.push('description = ?');
              values.push(slotData.description);
            }
            if (slotData.features !== undefined) {
              updates.push('features = ?');
              values.push(slotData.features ? JSON.stringify(slotData.features) : null);
            }
            if (slotData.is_featured !== undefined) {
              updates.push('is_featured = ?');
              values.push(slotData.is_featured);
            }
            if (slotData.is_new !== undefined) {
              updates.push('is_new = ?');
              values.push(slotData.is_new);
            }
            if (slotData.is_popular !== undefined) {
              updates.push('is_popular = ?');
              values.push(slotData.is_popular);
            }
            updates.push('parsed_at = NOW()');

            if (updates.length > 1) {
              values.push(existing[0].id);
              await connection2.query(
                `UPDATE slots SET ${updates.join(', ')} WHERE id = ?`,
                values
              );
            }

            const [updated] = await connection2.query<RowDataPacket[]>(
              'SELECT * FROM slots WHERE id = ?',
              [existing[0].id]
            );
            if (updated && updated.length > 0) {
              savedSlots.push(updated[0] as Slot);
            }
          } else {
            // Insert new slot
            const [result] = await connection2.query(
              `INSERT INTO slots (
                casino_id, geo, name, provider, image_url, description, 
                features, is_featured, is_new, is_popular, parsed_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
              [
                slotData.casino_id,
                slotData.geo,
                slotData.name,
                slotData.provider,
                slotData.image_url,
                slotData.description,
                slotData.features ? JSON.stringify(slotData.features) : null,
                slotData.is_featured || false,
                slotData.is_new || false,
                slotData.is_popular || false,
              ]
            );

            const insertId = (result as any).insertId;
            const [newSlot] = await connection2.query<RowDataPacket[]>(
              'SELECT * FROM slots WHERE id = ?',
              [insertId]
            );
            if (newSlot && newSlot.length > 0) {
              savedSlots.push(newSlot[0] as Slot);
            }
          }
        }
      }
    } finally {
      connection2.release();
    }

    const summary = results.map((r) => ({
      geo: r.geo,
      count: r.slots.length,
    }));

    res.json({
      message: `Successfully parsed and saved ${savedSlots.length} slots`,
      summary,
      total: savedSlots.length,
    });
  } catch (error: any) {
    console.error('Error parsing slots:', error);
    res.status(500).json({
      error: 'Failed to parse slots',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Delete a slot
 */
export const deleteSlot = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    await connection.query('DELETE FROM slots WHERE id = ?', [id]);
    connection.release();

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting slot:', error);
    res.status(500).json({ error: 'Failed to delete slot' });
  }
};
