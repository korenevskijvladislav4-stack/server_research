import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../database/connection';
import { AuthRequest } from '../middleware/auth.middleware';

type FieldRow = RowDataPacket & {
  id: number;
  key_name: string;
  label: string;
  description: string | null;
  field_type: string;
  options_json: any | null;
  group_name: string | null;
  sort_order: number;
  is_required: number;
  is_active: number;
  created_at: Date;
  updated_at: Date;
};

type ValueRow = RowDataPacket & {
  casino_id: number;
  field_id: number;
  value_json: any | null;
  updated_at: Date;
  updated_by: number | null;
};

// OLD Field management functions for casino_profile_fields (legacy system)
export const listProfileFields = async (_req: Request, res: Response): Promise<void> => {
  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT *
       FROM casino_profile_fields
       ORDER BY group_name IS NULL, group_name ASC, sort_order ASC, id ASC`
    );
    conn.release();
    res.json(rows);
  } catch (e) {
    console.error('listProfileFields error:', e);
    res.status(500).json({ error: 'Failed to list profile fields' });
  }
};

export const createProfileField = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const actorId = req.user?.id ?? null;
    const {
      key_name,
      label,
      description,
      field_type,
      options_json,
      group_name,
      sort_order,
      is_required,
      is_active,
    } = req.body ?? {};

    if (!key_name || !label || !field_type) {
      res.status(400).json({ error: 'key_name, label, field_type are required' });
      return;
    }

    const normalizedGroup =
      Array.isArray(group_name) && group_name.length > 0
        ? String(group_name[0])
        : group_name || null;

    const conn = await pool.getConnection();
    let optionsJsonValue: string | null = null;
    if (options_json !== null && options_json !== undefined) {
      if (typeof options_json === 'string') {
        optionsJsonValue = options_json;
      } else {
        optionsJsonValue = JSON.stringify(options_json);
      }
    }

    const [result] = await conn.query(
      `INSERT INTO casino_profile_fields
       (key_name, label, description, field_type, options_json, group_name, sort_order, is_required, is_active, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        key_name,
        label,
        description ?? null,
        field_type,
        optionsJsonValue,
        normalizedGroup,
        Number.isFinite(sort_order) ? sort_order : 0,
        !!is_required,
        is_active === undefined ? true : !!is_active,
        actorId,
        actorId,
      ]
    );
    const fieldId = (result as any).insertId as number;

    const [rows] = await conn.query<FieldRow[]>(
      'SELECT * FROM casino_profile_fields WHERE id = ?',
      [fieldId]
    );
    conn.release();
    res.status(201).json(rows[0]);
  } catch (e: any) {
    console.error('createProfileField error:', e);
    res.status(500).json({ error: 'Failed to create profile field' });
  }
};

export const updateProfileField = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const actorId = req.user?.id ?? null;
    const { id } = req.params;
    const fieldId = Number(id);
    if (!fieldId) {
      res.status(400).json({ error: 'Invalid field id' });
      return;
    }

    const conn = await pool.getConnection();
    const [existingRows] = await conn.query<FieldRow[]>(
      'SELECT * FROM casino_profile_fields WHERE id = ?',
      [fieldId]
    );
    if (!Array.isArray(existingRows) || existingRows.length === 0) {
      conn.release();
      res.status(404).json({ error: 'Field not found' });
      return;
    }

    const patch = req.body ?? {};
    const updates: string[] = [];
    const values: any[] = [];
    const allow = [
      'key_name',
      'label',
      'description',
      'field_type',
      'options_json',
      'group_name',
      'sort_order',
      'is_required',
      'is_active',
    ];
    for (const k of allow) {
      if (patch[k] !== undefined) {
        updates.push(`${k} = ?`);
        if (k === 'is_required' || k === 'is_active') {
          values.push(!!patch[k]);
        } else if (k === 'options_json') {
          let optionsJsonValue: string | null = null;
          if (patch[k] !== null && patch[k] !== undefined) {
            if (typeof patch[k] === 'string') {
              optionsJsonValue = patch[k];
            } else {
              optionsJsonValue = JSON.stringify(patch[k]);
            }
          }
          values.push(optionsJsonValue);
        } else if (k === 'group_name') {
          const normalizedGroup =
            Array.isArray(patch[k]) && patch[k].length > 0
              ? String(patch[k][0])
              : patch[k] || null;
          values.push(normalizedGroup);
        } else {
          values.push(patch[k]);
        }
      }
    }
    updates.push('updated_by = ?');
    values.push(actorId);
    values.push(fieldId);

    if (updates.length === 1) {
      conn.release();
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    await conn.query(`UPDATE casino_profile_fields SET ${updates.join(', ')} WHERE id = ?`, values);

    const [rows] = await conn.query<FieldRow[]>('SELECT * FROM casino_profile_fields WHERE id = ?', [
      fieldId,
    ]);
    conn.release();
    res.json(rows[0]);
  } catch (e: any) {
    console.error('updateProfileField error:', e);
    res.status(500).json({ error: 'Failed to update profile field' });
  }
};

export const deleteProfileField = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const fieldId = Number(req.params.id);
    if (!fieldId) {
      res.status(400).json({ error: 'Invalid field id' });
      return;
    }

    const conn = await pool.getConnection();
    const [existingRows] = await conn.query<FieldRow[]>(
      'SELECT * FROM casino_profile_fields WHERE id = ?',
      [fieldId]
    );
    if (!Array.isArray(existingRows) || existingRows.length === 0) {
      conn.release();
      res.status(404).json({ error: 'Field not found' });
      return;
    }

    await conn.query('DELETE FROM casino_profile_fields WHERE id = ?', [fieldId]);
    conn.release();
    res.json({ message: 'Field deleted' });
  } catch (e) {
    console.error('deleteProfileField error:', e);
    res.status(500).json({ error: 'Failed to delete profile field' });
  }
};

export const getCasinoProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const casinoId = Number(req.params.casinoId);
    if (!casinoId) {
      res.status(400).json({ error: 'Invalid casinoId' });
      return;
    }

    const conn = await pool.getConnection();
    const [fields] = await conn.query<FieldRow[]>(
      `SELECT *
       FROM casino_profile_fields
       WHERE is_active = TRUE
       ORDER BY group_name IS NULL, group_name ASC, sort_order ASC, id ASC`
    );

    const [values] = await conn.query<ValueRow[]>(
      `SELECT casino_id, field_id, value_json, updated_at, updated_by
       FROM casino_profile_values
       WHERE casino_id = ?`,
      [casinoId]
    );
    conn.release();

    const byFieldId = new Map<number, ValueRow>();
    if (Array.isArray(values)) {
      for (const v of values) byFieldId.set(v.field_id, v);
    }

    const profile = (fields as any[]).map((f) => ({
      field: f,
      value: byFieldId.get(f.id)?.value_json ?? null,
      updated_at: byFieldId.get(f.id)?.updated_at ?? null,
      updated_by: byFieldId.get(f.id)?.updated_by ?? null,
    }));

    res.json({ casino_id: casinoId, profile });
  } catch (e) {
    console.error('getCasinoProfile error:', e);
    res.status(500).json({ error: 'Failed to get casino profile' });
  }
};

export const upsertCasinoProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const actorId = req.user?.id ?? null;
    const casinoId = Number(req.params.casinoId);
    if (!casinoId) {
      res.status(400).json({ error: 'Invalid casinoId' });
      return;
    }

    const items: Array<{ field_id: number; value_json: any }> = req.body?.items ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'items[] is required' });
      return;
    }

    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      for (const item of items) {
        const fieldId = Number(item.field_id);
        if (!fieldId) continue;

        const [existing] = await conn.query<RowDataPacket[]>(
          'SELECT value_json FROM casino_profile_values WHERE casino_id = ? AND field_id = ?',
          [casinoId, fieldId]
        );
        const oldVal =
          Array.isArray(existing) && existing.length > 0
            ? (existing[0] as any).value_json
            : null;
        const oldValJson =
          oldVal === null || oldVal === undefined ? null : JSON.stringify(oldVal);

        if (item.value_json === null || item.value_json === undefined || item.value_json === '') {
          await conn.query(
            'DELETE FROM casino_profile_values WHERE casino_id = ? AND field_id = ?',
            [casinoId, fieldId]
          );
          await conn.query(
            `INSERT INTO casino_profile_history
             (casino_id, field_id, action, old_value_json, new_value_json, meta_json, actor_user_id)
             VALUES (?, ?, 'clear_value', ?, NULL, NULL, ?)`,
            [casinoId, fieldId, oldValJson, actorId]
          );
          continue;
        }

        await conn.query(
          `INSERT INTO casino_profile_values (casino_id, field_id, value_json, updated_by)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_by = VALUES(updated_by)`,
          [casinoId, fieldId, JSON.stringify(item.value_json), actorId]
        );
        await conn.query(
          `INSERT INTO casino_profile_history
           (casino_id, field_id, action, old_value_json, new_value_json, meta_json, actor_user_id)
           VALUES (?, ?, 'set_value', ?, ?, NULL, ?)`,
          [
            casinoId,
            fieldId,
            oldValJson,
            JSON.stringify(item.value_json),
            actorId,
          ]
        );
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    res.json({ message: 'Profile updated' });
  } catch (e) {
    console.error('upsertCasinoProfile error:', e);
    res.status(500).json({ error: 'Failed to update casino profile' });
  }
};

export const getCasinoProfileHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const casinoId = Number(req.params.casinoId);
    const limit = Number(req.query.limit ?? 200);
    if (!casinoId) {
      res.status(400).json({ error: 'Invalid casinoId' });
      return;
    }

    const conn = await pool.getConnection();
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT h.*, f.key_name, f.label, u.username AS actor_username
       FROM casino_profile_history h
       LEFT JOIN casino_profile_fields f ON f.id = h.field_id
       LEFT JOIN users u ON u.id = h.actor_user_id
       WHERE h.casino_id = ?
       ORDER BY h.created_at DESC
       LIMIT ?`,
      [casinoId, Number.isFinite(limit) ? limit : 200]
    );
    conn.release();
    res.json(rows);
  } catch (e) {
    console.error('getCasinoProfileHistory error:', e);
    res.status(500).json({ error: 'Failed to get profile history' });
  }
};

// Получить все значения профилей для всех казино (для таблицы)
export const getAllProfileValues = async (_req: Request, res: Response): Promise<void> => {
  try {
    const conn = await pool.getConnection();
    
    // Получаем все значения профилей с key_name поля
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT v.casino_id, f.key_name, v.value_json
       FROM casino_profile_values v
       JOIN casino_profile_fields f ON f.id = v.field_id
       WHERE f.is_active = 1`
    );
    conn.release();
    
    // Группируем по casino_id
    const result: Record<number, Record<string, any>> = {};
    for (const row of rows) {
      const casinoId = row.casino_id as number;
      const keyName = row.key_name as string;
      let value = row.value_json;
      
      // Парсим JSON если это строка
      if (typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch {
          // оставляем как есть
        }
      }
      
      if (!result[casinoId]) {
        result[casinoId] = {};
      }
      result[casinoId][keyName] = value;
    }
    
    res.json(result);
  } catch (e) {
    console.error('getAllProfileValues error:', e);
    res.status(500).json({ error: 'Failed to get all profile values' });
  }
};
