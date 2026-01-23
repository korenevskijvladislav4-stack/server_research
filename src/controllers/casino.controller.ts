import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../database/connection';
import { Casino, CreateCasinoDto, UpdateCasinoDto } from '../models/Casino';

export const getAllCasinos = async (_req: Request, res: Response): Promise<void> => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM casinos ORDER BY created_at DESC'
    );
    connection.release();
    const casinos = (rows as unknown as any[]).map((r) => {
      let geoValue = null;
      if (r.geo) {
        if (typeof r.geo === 'string') {
          try {
            geoValue = JSON.parse(r.geo);
          } catch {
            // If parsing fails, treat as single value
            geoValue = [r.geo];
          }
        } else if (Array.isArray(r.geo)) {
          geoValue = r.geo;
        } else {
          geoValue = r.geo;
        }
      }
      return {
        ...r,
        geo: geoValue,
      };
    });
    res.json(casinos as unknown as Casino[]);
  } catch (error: any) {
    console.error('Error fetching casinos:', error);
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
      errno: error?.errno,
      sqlState: error?.sqlState,
      sqlMessage: error?.sqlMessage,
    });
    res.status(500).json({ error: 'Failed to fetch casinos' });
  }
};

export const getCasinoById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();
    const [rows] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM casinos WHERE id = ?',
      [id]
    );
    connection.release();

    if (Array.isArray(rows) && rows.length === 0) {
      res.status(404).json({ error: 'Casino not found' });
      return;
    }

    const casino = rows[0] as any;
    if (casino.geo) {
      if (typeof casino.geo === 'string') {
        try {
          casino.geo = JSON.parse(casino.geo);
        } catch {
          casino.geo = [casino.geo];
        }
      } else if (!Array.isArray(casino.geo)) {
        casino.geo = [casino.geo];
      }
    }
    res.json(casino as unknown as Casino);
  } catch (error) {
    console.error('Error fetching casino:', error);
    res.status(500).json({ error: 'Failed to fetch casino' });
  }
};

export const createCasino = async (req: Request, res: Response): Promise<void> => {
  try {
    const data: CreateCasinoDto = req.body;
    
    if (!data.name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    
    const connection = await pool.getConnection();
    
    // Handle geo field - it can be array, comma-separated string, or null
    let geoValue: string | null = null;
    if (data.geo) {
      if (Array.isArray(data.geo)) {
        // Filter out empty strings and normalize
        const filtered = data.geo.filter((g) => g && String(g).trim()).map((g) => String(g).trim().toUpperCase());
        geoValue = filtered.length > 0 ? JSON.stringify(filtered) : null;
      } else if (typeof data.geo === 'string') {
        const geoStr = (data.geo as string).trim();
        if (!geoStr) {
          geoValue = null;
        } else {
          // Check if it looks like JSON (starts with [ or {)
          if (geoStr.startsWith('[') || geoStr.startsWith('{')) {
            try {
              const parsed = JSON.parse(geoStr);
              const arr = Array.isArray(parsed) ? parsed : [parsed];
              const filtered = arr.filter((g) => g && String(g).trim()).map((g) => String(g).trim().toUpperCase());
              geoValue = filtered.length > 0 ? JSON.stringify(filtered) : null;
            } catch {
              // If JSON parse fails, treat as comma-separated string
              const parts = geoStr
                .split(/[,;]/)
                .map((s: string) => s.trim().toUpperCase())
                .filter(Boolean);
              geoValue = parts.length > 0 ? JSON.stringify(parts) : null;
            }
          } else {
            // Not JSON, treat as comma-separated string
            const parts = geoStr
              .split(/[,;]/)
              .map((s: string) => s.trim().toUpperCase())
              .filter(Boolean);
            geoValue = parts.length > 0 ? JSON.stringify(parts) : null;
          }
        }
      } else {
        // Other types - try to convert to array
        try {
          const arr = Array.isArray(data.geo) ? data.geo : [data.geo];
          const filtered = arr.filter((g) => g && String(g).trim()).map((g) => String(g).trim().toUpperCase());
          geoValue = filtered.length > 0 ? JSON.stringify(filtered) : null;
        } catch {
          geoValue = null;
        }
      }
    }
    
    const [result] = await connection.query(
      `INSERT INTO casinos (name, website, description, geo, is_our, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        data.website || null,
        data.description || null,
        geoValue,
        data.is_our ? 1 : 0,
        data.status || 'pending',
        (req as any).user?.id || null
      ]
    );

    const insertId = (result as any).insertId;
    const [newCasino] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM casinos WHERE id = ?',
      [insertId]
    );
    
    connection.release();
    const casino = (newCasino as any[])[0];
    if (casino && casino.geo) {
      if (typeof casino.geo === 'string') {
        try {
          casino.geo = JSON.parse(casino.geo);
        } catch {
          // Fallback: treat raw string as single GEO or comma-separated list
          const parts = (casino.geo as string)
            .split(/[,;]/)
            .map((s: string) => s.trim().toUpperCase())
            .filter(Boolean);
          casino.geo = parts.length > 0 ? parts : [casino.geo];
        }
      } else if (!Array.isArray(casino.geo)) {
        casino.geo = [casino.geo];
      }
    }
    res.status(201).json(casino as unknown as Casino);
  } catch (error: any) {
    console.error('Error creating casino:', error);
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
      errno: error?.errno,
      sqlState: error?.sqlState,
      sqlMessage: error?.sqlMessage,
      sql: error?.sql,
    });
    res.status(500).json({
      error: 'Failed to create casino',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined,
    });
  }
};

export const updateCasino = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const data: UpdateCasinoDto = req.body;
    const connection = await pool.getConnection();

    const updateFields: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      updateFields.push('name = ?');
      values.push(data.name);
    }
    if (data.website !== undefined) {
      updateFields.push('website = ?');
      values.push(data.website);
    }
    if (data.description !== undefined) {
      updateFields.push('description = ?');
      values.push(data.description);
    }
    if (data.geo !== undefined) {
      updateFields.push('geo = ?');
      // Handle geo field - it can be array, comma-separated string, or null
      let geoValue: string | null = null;
      if (data.geo) {
        if (Array.isArray(data.geo)) {
          // Filter out empty strings and normalize
          const filtered = data.geo.filter((g) => g && String(g).trim()).map((g) => String(g).trim().toUpperCase());
          geoValue = filtered.length > 0 ? JSON.stringify(filtered) : null;
        } else if (typeof data.geo === 'string') {
          const geoStr = (data.geo as string).trim();
          if (!geoStr) {
            geoValue = null;
          } else {
            // Check if it looks like JSON (starts with [ or {)
            if (geoStr.startsWith('[') || geoStr.startsWith('{')) {
              try {
                const parsed = JSON.parse(geoStr);
                const arr = Array.isArray(parsed) ? parsed : [parsed];
                const filtered = arr.filter((g) => g && String(g).trim()).map((g) => String(g).trim().toUpperCase());
                geoValue = filtered.length > 0 ? JSON.stringify(filtered) : null;
              } catch {
                // If JSON parse fails, treat as comma-separated string
                const parts = geoStr
                  .split(/[,;]/)
                  .map((s: string) => s.trim().toUpperCase())
                  .filter(Boolean);
                geoValue = parts.length > 0 ? JSON.stringify(parts) : null;
              }
            } else {
              // Not JSON, treat as comma-separated string
              const parts = geoStr
                .split(/[,;]/)
                .map((s: string) => s.trim().toUpperCase())
                .filter(Boolean);
              geoValue = parts.length > 0 ? JSON.stringify(parts) : null;
            }
          }
        } else {
          // Other types - try to convert to array
          try {
            const arr = Array.isArray(data.geo) ? data.geo : [data.geo];
            const filtered = arr.filter((g) => g && String(g).trim()).map((g) => String(g).trim().toUpperCase());
            geoValue = filtered.length > 0 ? JSON.stringify(filtered) : null;
          } catch {
            geoValue = null;
          }
        }
      }
      values.push(geoValue);
    }
    if (data.is_our !== undefined) {
      updateFields.push('is_our = ?');
      values.push(data.is_our ? 1 : 0);
    }
    if (data.status !== undefined) {
      updateFields.push('status = ?');
      values.push(data.status);
    }

    if (updateFields.length === 0) {
      connection.release();
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(id);

    await connection.query(
      `UPDATE casinos SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    );

    const [updated] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM casinos WHERE id = ?',
      [id]
    );

    connection.release();
    
    if (!Array.isArray(updated) || updated.length === 0) {
      res.status(404).json({ error: 'Casino not found' });
      return;
    }
    
    const casino = (updated as any[])[0];
    if (casino && casino.geo) {
      if (typeof casino.geo === 'string') {
        try {
          casino.geo = JSON.parse(casino.geo);
        } catch {
          const parts = (casino.geo as string)
            .split(/[,;]/)
            .map((s: string) => s.trim().toUpperCase())
            .filter(Boolean);
          casino.geo = parts.length > 0 ? parts : [casino.geo];
        }
      } else if (!Array.isArray(casino.geo)) {
        casino.geo = [casino.geo];
      }
    }
    res.json(casino as unknown as Casino);
  } catch (error: any) {
    console.error('Error updating casino:', error);
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
      errno: error?.errno,
      sqlState: error?.sqlState,
      sqlMessage: error?.sqlMessage,
      sql: error?.sql,
    });
    res.status(500).json({
      error: 'Failed to update casino',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined,
    });
  }
};

export const deleteCasino = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();
    
    await connection.query('DELETE FROM casinos WHERE id = ?', [id]);
    connection.release();
    
    res.json({ message: 'Casino deleted successfully' });
  } catch (error) {
    console.error('Error deleting casino:', error);
    res.status(500).json({ error: 'Failed to delete casino' });
  }
};
