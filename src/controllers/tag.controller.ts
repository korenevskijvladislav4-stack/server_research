import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../database/connection';

// -----------------------------------------------------------------------
// List all tags
// -----------------------------------------------------------------------
export const listTags = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM tags ORDER BY name',
    );
    res.json(rows);
  } catch (error) {
    console.error('Error listing tags:', error);
    res.status(500).json({ error: 'Failed to list tags' });
  }
};

// -----------------------------------------------------------------------
// Create tag
// -----------------------------------------------------------------------
export const createTag = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, color } = req.body;
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const [result] = await pool.query(
      'INSERT INTO tags (name, color) VALUES (?, ?)',
      [name.trim(), color || '#1677ff'],
    );
    const insertId = (result as any).insertId;
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM tags WHERE id = ?',
      [insertId],
    );
    res.status(201).json(rows[0]);
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'Тег с таким именем уже существует' });
      return;
    }
    console.error('Error creating tag:', error);
    res.status(500).json({ error: 'Failed to create tag' });
  }
};

// -----------------------------------------------------------------------
// Delete tag
// -----------------------------------------------------------------------
export const deleteTag = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM tags WHERE id = ?', [id]);
    res.json({ message: 'Tag deleted' });
  } catch (error) {
    console.error('Error deleting tag:', error);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
};

// -----------------------------------------------------------------------
// Get tags for a casino
// -----------------------------------------------------------------------
export const getCasinoTags = async (req: Request, res: Response): Promise<void> => {
  try {
    const { casinoId } = req.params;
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT t.* FROM tags t
       JOIN casino_tags ct ON ct.tag_id = t.id
       WHERE ct.casino_id = ?
       ORDER BY t.name`,
      [casinoId],
    );
    res.json(rows);
  } catch (error) {
    console.error('Error getting casino tags:', error);
    res.status(500).json({ error: 'Failed to get casino tags' });
  }
};

// -----------------------------------------------------------------------
// Set tags for a casino (replace all)
// -----------------------------------------------------------------------
export const setCasinoTags = async (req: Request, res: Response): Promise<void> => {
  try {
    const { casinoId } = req.params;
    const { tagIds } = req.body; // number[]

    if (!Array.isArray(tagIds)) {
      res.status(400).json({ error: 'tagIds must be an array' });
      return;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM casino_tags WHERE casino_id = ?', [casinoId]);
      if (tagIds.length > 0) {
        const values = tagIds.map((tagId: number) => [Number(casinoId), tagId]);
        await conn.query(
          'INSERT INTO casino_tags (casino_id, tag_id) VALUES ?',
          [values],
        );
      }
      await conn.commit();
      conn.release();
    } catch (err) {
      await conn.rollback();
      conn.release();
      throw err;
    }

    // Return updated tags
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT t.* FROM tags t
       JOIN casino_tags ct ON ct.tag_id = t.id
       WHERE ct.casino_id = ?
       ORDER BY t.name`,
      [casinoId],
    );
    res.json(rows);
  } catch (error) {
    console.error('Error setting casino tags:', error);
    res.status(500).json({ error: 'Failed to set casino tags' });
  }
};

// -----------------------------------------------------------------------
// Get all casino → tag mappings (for list view filtering)
// -----------------------------------------------------------------------
export const getAllCasinoTags = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ct.casino_id, t.id, t.name, t.color
       FROM casino_tags ct
       JOIN tags t ON t.id = ct.tag_id
       ORDER BY t.name`,
    );
    // Group by casino_id
    const map: Record<number, { id: number; name: string; color: string }[]> = {};
    for (const row of rows) {
      if (!map[row.casino_id]) map[row.casino_id] = [];
      map[row.casino_id].push({ id: row.id, name: row.name, color: row.color });
    }
    res.json(map);
  } catch (error) {
    console.error('Error getting all casino tags:', error);
    res.status(500).json({ error: 'Failed to get all casino tags' });
  }
};
