import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../database/connection';

export interface EmailTopicRow {
  id: number;
  name: string;
  description?: string | null;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export const getEmailTopics = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name, description, sort_order, created_at, updated_at FROM email_topics ORDER BY sort_order ASC, name ASC',
    );
    res.json(rows as EmailTopicRow[]);
  } catch (error) {
    console.error('Error fetching email topics:', error);
    res.status(500).json({ error: 'Failed to fetch email topics' });
  }
};

export const createEmailTopic = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description } = req.body;
    if (!name || !String(name).trim()) {
      res.status(400).json({ error: 'Название обязательно' });
      return;
    }
    const [maxRows] = await pool.query<RowDataPacket[]>(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM email_topics',
    );
    const nextOrder = (maxRows[0] as any)?.next_order ?? 0;
    const [result] = await pool.query(
      'INSERT INTO email_topics (name, description, sort_order) VALUES (?, ?, ?)',
      [String(name).trim(), description ? String(description).trim() : null, nextOrder],
    );
    const insertId = (result as any).insertId;
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name, description, sort_order, created_at, updated_at FROM email_topics WHERE id = ?',
      [insertId],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error creating email topic:', error);
    res.status(500).json({ error: 'Failed to create email topic' });
  }
};

export const updateEmailTopic = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const { name, description, sort_order } = req.body;
    if (!id) {
      res.status(400).json({ error: 'ID темы обязателен' });
      return;
    }
    const updates: string[] = [];
    const params: any[] = [];
    if (name !== undefined) {
      updates.push('name = ?');
      params.push(String(name).trim());
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description ? String(description).trim() : null);
    }
    if (sort_order !== undefined) {
      updates.push('sort_order = ?');
      params.push(Number(sort_order));
    }
    if (updates.length === 0) {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id, name, description, sort_order, created_at, updated_at FROM email_topics WHERE id = ?',
        [id],
      );
      res.json(rows[0]);
      return;
    }
    params.push(id);
    await pool.query(
      `UPDATE email_topics SET ${updates.join(', ')} WHERE id = ?`,
      params,
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name, description, sort_order, created_at, updated_at FROM email_topics WHERE id = ?',
      [id],
    );
    res.json(rows[0] || null);
  } catch (error) {
    console.error('Error updating email topic:', error);
    res.status(500).json({ error: 'Failed to update email topic' });
  }
};

export const deleteEmailTopic = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    await pool.query('UPDATE emails SET topic_id = NULL WHERE topic_id = ?', [id]);
    await pool.query('DELETE FROM email_topics WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting email topic:', error);
    res.status(500).json({ error: 'Failed to delete email topic' });
  }
};
