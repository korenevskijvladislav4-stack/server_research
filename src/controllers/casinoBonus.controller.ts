import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import pool from '../database/connection';
import { AuthRequest } from '../middleware/auth.middleware';
import { CasinoBonus } from '../models/CasinoBonus';
import { CasinoBonusImage } from '../models/CasinoBonusImage';

// Configure storage for bonus images
const uploadsRoot = path.join(__dirname, '..', '..', 'uploads');
const bonusImagesDir = path.join(uploadsRoot, 'bonuses');

// Ensure directories exist
if (!fs.existsSync(bonusImagesDir)) {
  fs.mkdirSync(bonusImagesDir, { recursive: true });
}

const bonusImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, bonusImagesDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || '';
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const bonusImageUpload = multer({
  storage: bonusImageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
}).array('images', 10); // Allow up to 10 images at once

// Get all bonuses with filters (for global bonuses page)
export const getAllBonuses = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      casino_id,
      geo,
      bonus_category,
      bonus_kind,
      bonus_type,
      status,
      search,
      limit = 50,
      offset = 0,
    } = req.query;

    const conn = await pool.getConnection();
    const conditions: string[] = [];
    const params: any[] = [];

    if (casino_id) {
      conditions.push('b.casino_id = ?');
      params.push(casino_id);
    }
    if (geo) {
      conditions.push('b.geo = ?');
      params.push(geo);
    }
    if (bonus_category) {
      conditions.push('b.bonus_category = ?');
      params.push(bonus_category);
    }
    if (bonus_kind) {
      conditions.push('b.bonus_kind = ?');
      params.push(bonus_kind);
    }
    if (bonus_type) {
      conditions.push('b.bonus_type = ?');
      params.push(bonus_type);
    }
    if (status) {
      conditions.push('b.status = ?');
      params.push(status);
    }
    if (search) {
      conditions.push('(b.name LIKE ? OR b.promo_code LIKE ? OR c.name LIKE ?)');
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const [countResult] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM casino_bonuses b
       LEFT JOIN casinos c ON b.casino_id = c.id
       ${whereClause}`,
      params
    );
    const total = (countResult[0] as any).total;

    // Get data with pagination
    const dataParams = [...params, parseInt(limit as string), parseInt(offset as string)];
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT b.*, c.name as casino_name
       FROM casino_bonuses b
       LEFT JOIN casinos c ON b.casino_id = c.id
       ${whereClause}
       ORDER BY b.created_at DESC
       LIMIT ? OFFSET ?`,
      dataParams
    );

    conn.release();

    res.json({
      data: rows,
      total,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (e) {
    console.error('getAllBonuses error:', e);
    res.status(500).json({ error: 'Failed to load bonuses' });
  }
};

export const listCasinoBonuses = async (req: Request, res: Response): Promise<void> => {
  try {
    const casinoId = Number(req.params.casinoId);
    const { geo } = req.query;

    if (!casinoId) {
      res.status(400).json({ error: 'Invalid casinoId' });
      return;
    }

    const conn = await pool.getConnection();
    const params: any[] = [casinoId];
    let sql = 'SELECT * FROM casino_bonuses WHERE casino_id = ?';

    if (geo) {
      sql += ' AND geo = ?';
      params.push(geo);
    }

    sql += ' ORDER BY geo, name';

    const [rows] = await conn.query<RowDataPacket[]>(sql, params);
    conn.release();

    res.json(rows as unknown as CasinoBonus[]);
  } catch (e) {
    console.error('listCasinoBonuses error:', e);
    res.status(500).json({ error: 'Failed to load bonuses' });
  }
};

export const createCasinoBonus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const casinoId = Number(req.params.casinoId);
    if (!casinoId) {
      res.status(400).json({ error: 'Invalid casinoId' });
      return;
    }

    const actorId = req.user?.id ?? null;
    const {
      geo,
      name,
      bonus_category = 'casino',
      bonus_kind,
      bonus_type,
      bonus_value,
      bonus_unit,
      currency,
      freespins_count,
      freespin_value,
      freespin_game,
      cashback_percent,
      cashback_period,
      min_deposit,
      max_bonus,
      max_cashout,
      wagering_requirement,
      wagering_games,
      promo_code,
      valid_from,
      valid_to,
      status = 'active',
      notes,
    } = req.body ?? {};

    if (!geo || !name) {
      res.status(400).json({ error: 'geo and name are required' });
      return;
    }

    const conn = await pool.getConnection();
    const [result] = await conn.query(
      `INSERT INTO casino_bonuses 
       (casino_id, geo, name, bonus_category, bonus_kind, bonus_type, bonus_value, bonus_unit, currency, 
        freespins_count, freespin_value, freespin_game, cashback_percent, cashback_period,
        min_deposit, max_bonus, max_cashout, wagering_requirement, wagering_games, 
        promo_code, valid_from, valid_to, status, notes, created_by, updated_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        casinoId,
        geo,
        name,
        bonus_category,
        bonus_kind ?? null,
        bonus_type ?? null,
        bonus_value ?? null,
        bonus_unit ?? null,
        currency ?? null,
        freespins_count ?? null,
        freespin_value ?? null,
        freespin_game ?? null,
        cashback_percent ?? null,
        cashback_period ?? null,
        min_deposit ?? null,
        max_bonus ?? null,
        max_cashout ?? null,
        wagering_requirement ?? null,
        wagering_games ?? null,
        promo_code ?? null,
        valid_from ?? null,
        valid_to ?? null,
        status,
        notes ?? null,
        actorId,
        actorId,
      ]
    );

    const id = (result as any).insertId;
    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT * FROM casino_bonuses WHERE id = ?',
      [id]
    );
    conn.release();

    res.status(201).json(rows[0] as unknown as CasinoBonus);
  } catch (e) {
    console.error('createCasinoBonus error:', e);
    res.status(500).json({ error: 'Failed to create bonus' });
  }
};

export const updateCasinoBonus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const casinoId = Number(req.params.casinoId);
    const id = Number(req.params.id);
    if (!casinoId || !id) {
      res.status(400).json({ error: 'Invalid ids' });
      return;
    }

    const actorId = req.user?.id ?? null;
    const patch = req.body ?? {};

    const conn = await pool.getConnection();

    const [existingRows] = await conn.query<RowDataPacket[]>(
      'SELECT * FROM casino_bonuses WHERE id = ? AND casino_id = ?',
      [id, casinoId]
    );
    if (!Array.isArray(existingRows) || existingRows.length === 0) {
      conn.release();
      res.status(404).json({ error: 'Bonus not found' });
      return;
    }

    const columns = [
      'geo',
      'name',
      'bonus_category',
      'bonus_kind',
      'bonus_type',
      'bonus_value',
      'bonus_unit',
      'currency',
      'freespins_count',
      'freespin_value',
      'freespin_game',
      'cashback_percent',
      'cashback_period',
      'min_deposit',
      'max_bonus',
      'max_cashout',
      'wagering_requirement',
      'wagering_games',
      'promo_code',
      'valid_from',
      'valid_to',
      'status',
      'notes',
    ];

    const sets: string[] = [];
    const values: any[] = [];

    for (const c of columns) {
      if (Object.prototype.hasOwnProperty.call(patch, c)) {
        sets.push(`${c} = ?`);
        values.push((patch as any)[c]);
      }
    }

    sets.push('updated_by = ?');
    values.push(actorId);
    values.push(id, casinoId);

    if (sets.length === 1) {
      conn.release();
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    await conn.query(
      `UPDATE casino_bonuses SET ${sets.join(', ')} WHERE id = ? AND casino_id = ?`,
      values
    );

    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT * FROM casino_bonuses WHERE id = ?',
      [id]
    );
    conn.release();

    res.json(rows[0] as unknown as CasinoBonus);
  } catch (e) {
    console.error('updateCasinoBonus error:', e);
    res.status(500).json({ error: 'Failed to update bonus' });
  }
};

export const deleteCasinoBonus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const casinoId = Number(req.params.casinoId);
    const id = Number(req.params.id);
    if (!casinoId || !id) {
      res.status(400).json({ error: 'Invalid ids' });
      return;
    }

    const conn = await pool.getConnection();
    await conn.query('DELETE FROM casino_bonuses WHERE id = ? AND casino_id = ?', [id, casinoId]);
    conn.release();
    res.json({ message: 'Bonus deleted' });
  } catch (e) {
    console.error('deleteCasinoBonus error:', e);
    res.status(500).json({ error: 'Failed to delete bonus' });
  }
};

export const uploadBonusImages = (req: Request, res: Response): void => {
  bonusImageUpload(req, res, async (err) => {
    if (err) {
      console.error('Error uploading bonus images:', err);
      res.status(400).json({ error: err.message || 'Failed to upload images' });
      return;
    }

    try {
      const { casinoId, bonusId } = req.params;
      const files = (req as any).files as Express.Multer.File[] | undefined;

      if (!files || files.length === 0) {
        res.status(400).json({ error: 'No files provided' });
        return;
      }

      const connection = await pool.getConnection();
      try {
        const uploadedImages: CasinoBonusImage[] = [];

        for (const file of files) {
          const fileName = path.basename(file.path);
          const relativePath = path.join('bonuses', fileName).replace(/\\/g, '/');

          await connection.query(
            `INSERT INTO casino_bonus_images (casino_id, bonus_id, file_path, original_name)
             VALUES (?, ?, ?, ?)`,
            [Number(casinoId), Number(bonusId), relativePath, file.originalname]
          );

          const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT * FROM casino_bonus_images WHERE casino_id = ? AND bonus_id = ? ORDER BY created_at DESC LIMIT 1`,
            [Number(casinoId), Number(bonusId)]
          );

          const image = rows[0] as unknown as CasinoBonusImage;
          uploadedImages.push({
            ...image,
            url: `/api/uploads/${image.file_path}`,
          });
        }

        res.status(201).json(uploadedImages);
      } finally {
        connection.release();
      }
    } catch (error: any) {
      console.error('Error saving bonus images:', error);
      console.error('Error details:', error.message, error.stack);
      res.status(500).json({ error: 'Failed to save images', details: error.message });
    }
  });
};

export const getBonusImages = async (req: Request, res: Response): Promise<void> => {
  try {
    const { bonusId } = req.params;
    const connection = await pool.getConnection();

    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT * FROM casino_bonus_images WHERE bonus_id = ? ORDER BY created_at DESC`,
      [bonusId]
    );

    connection.release();

    const images = (rows as unknown as CasinoBonusImage[]).map((img) => ({
      ...img,
      url: `/api/uploads/${img.file_path}`,
    }));

    res.json(images);
  } catch (error) {
    console.error('Error fetching bonus images:', error);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
};

export const deleteBonusImage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { imageId } = req.params;
    const connection = await pool.getConnection();

    // Get image info before deleting
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT * FROM casino_bonus_images WHERE id = ?`,
      [imageId]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      connection.release();
      res.status(404).json({ error: 'Image not found' });
      return;
    }

    const image = rows[0] as unknown as CasinoBonusImage;

    // Delete from database
    await connection.query(`DELETE FROM casino_bonus_images WHERE id = ?`, [imageId]);
    connection.release();

    // Delete file from filesystem
    const filePath = path.join(uploadsRoot, image.file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Error deleting bonus image:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
};
