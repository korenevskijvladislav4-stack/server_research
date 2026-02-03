import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import pool from '../database/connection';
import {
  CasinoPayment,
  CreateCasinoPaymentDto,
  UpdateCasinoPaymentDto,
} from '../models/CasinoPayment';
import { CasinoPaymentImage } from '../models/CasinoPaymentImage';

// Configure storage for payment images
const uploadsRoot = path.join(__dirname, '..', '..', 'uploads');
const paymentImagesDir = path.join(uploadsRoot, 'payments');

// Ensure directories exist
if (!fs.existsSync(paymentImagesDir)) {
  fs.mkdirSync(paymentImagesDir, { recursive: true });
}

const paymentImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, paymentImagesDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || '';
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const paymentImageUpload = multer({
  storage: paymentImageStorage,
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

// Get all payments with filters (for global payments page)
export const getAllPayments = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      casino_id,
      geo,
      type,
      method,
      direction,
      search,
      limit = 50,
      offset = 0,
    } = req.query;

    const conn = await pool.getConnection();
    const conditions: string[] = [];
    const params: any[] = [];

    if (casino_id) {
      conditions.push('p.casino_id = ?');
      params.push(casino_id);
    }
    if (geo) {
      conditions.push('p.geo = ?');
      params.push(geo);
    }
    if (direction === 'deposit' || direction === 'withdrawal') {
      conditions.push('p.direction = ?');
      params.push(direction);
    }
    if (type) {
      conditions.push('p.type = ?');
      params.push(type);
    }
    if (method) {
      conditions.push('p.method = ?');
      params.push(method);
    }
    if (search) {
      conditions.push('(p.type LIKE ? OR p.method LIKE ? OR c.name LIKE ?)');
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const [countResult] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM casino_payments p
       LEFT JOIN casinos c ON p.casino_id = c.id
       ${whereClause}`,
      params
    );
    const total = (countResult[0] as any).total;

    // Get data with pagination
    const dataParams = [...params, parseInt(limit as string), parseInt(offset as string)];
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT p.*, c.name as casino_name
       FROM casino_payments p
       LEFT JOIN casinos c ON p.casino_id = c.id
       ${whereClause}
       ORDER BY p.created_at DESC
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
    console.error('getAllPayments error:', e);
    res.status(500).json({ error: 'Failed to load payments' });
  }
};

export const listCasinoPayments = async (req: Request, res: Response): Promise<void> => {
  try {
    const { casinoId } = req.params;
    const { geo } = req.query;

    const conn = await pool.getConnection();
    try {
      let sql = 'SELECT * FROM casino_payments WHERE casino_id = ?';
      const params: any[] = [Number(casinoId)];

      if (geo) {
        sql += ' AND geo = ?';
        params.push(String(geo));
      }

      sql += ' ORDER BY direction, geo, type, method';

      const [rows] = await conn.query<RowDataPacket[]>(sql, params);
      const payments = rows as unknown as CasinoPayment[];
      res.json(payments);
    } finally {
      conn.release();
    }
  } catch (e: any) {
    console.error('listCasinoPayments error:', e);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
};

export const createCasinoPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { casinoId } = req.params;
    const body: CreateCasinoPaymentDto = req.body ?? {};

    const directionVal = body.direction === 'withdrawal' ? 'withdrawal' : 'deposit';
    if (!body.geo || !body.type || !body.method) {
      res.status(400).json({ error: 'geo, type and method are required' });
      return;
    }

    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query(
        `
        INSERT INTO casino_payments
          (casino_id, geo, direction, type, method, min_amount, max_amount, currency, notes, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          Number(casinoId),
          body.geo,
          directionVal,
          body.type,
          body.method,
          body.min_amount ?? null,
          body.max_amount ?? null,
          body.currency ?? null,
          body.notes ?? null,
          (req as any).user?.id ?? null,
          (req as any).user?.id ?? null,
        ]
      );

      const insertId = (result as any).insertId as number;
      const [rows] = await conn.query<RowDataPacket[]>(
        'SELECT * FROM casino_payments WHERE id = ?',
        [insertId]
      );
      const payment = rows[0] as unknown as CasinoPayment;
      res.status(201).json(payment);
    } finally {
      conn.release();
    }
  } catch (e: any) {
    console.error('createCasinoPayment error:', e);
    res.status(500).json({ error: 'Failed to create payment' });
  }
};

export const updateCasinoPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { casinoId, id } = req.params;
    const body: UpdateCasinoPaymentDto = req.body ?? {};
    const paymentId = Number(id);

    if (!paymentId) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }

    const conn = await pool.getConnection();
    try {
      const fields: string[] = [];
      const values: any[] = [];

      if (body.geo !== undefined) {
        fields.push('geo = ?');
        values.push(body.geo);
      }
      if (body.direction !== undefined) {
        fields.push('direction = ?');
        values.push(body.direction === 'withdrawal' ? 'withdrawal' : 'deposit');
      }
      if (body.type !== undefined) {
        fields.push('type = ?');
        values.push(body.type);
      }
      if (body.method !== undefined) {
        fields.push('method = ?');
        values.push(body.method);
      }
      if (body.min_amount !== undefined) {
        fields.push('min_amount = ?');
        values.push(body.min_amount ?? null);
      }
      if (body.max_amount !== undefined) {
        fields.push('max_amount = ?');
        values.push(body.max_amount ?? null);
      }
      if (body.currency !== undefined) {
        fields.push('currency = ?');
        values.push(body.currency ?? null);
      }
      if (body.notes !== undefined) {
        fields.push('notes = ?');
        values.push(body.notes ?? null);
      }

      fields.push('updated_by = ?');
      values.push((req as any).user?.id ?? null);

      if (fields.length === 1) {
        res.status(400).json({ error: 'No fields to update' });
        return;
      }

      values.push(paymentId, Number(casinoId));

      await conn.query(
        `UPDATE casino_payments SET ${fields.join(', ')} WHERE id = ? AND casino_id = ?`,
        values
      );

      const [rows] = await conn.query<RowDataPacket[]>(
        'SELECT * FROM casino_payments WHERE id = ? AND casino_id = ?',
        [paymentId, Number(casinoId)]
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        res.status(404).json({ error: 'Payment not found' });
        return;
      }

      const payment = rows[0] as unknown as CasinoPayment;
      res.json(payment);
    } finally {
      conn.release();
    }
  } catch (e: any) {
    console.error('updateCasinoPayment error:', e);
    res.status(500).json({ error: 'Failed to update payment' });
  }
};

export const deleteCasinoPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { casinoId, id } = req.params;
    const paymentId = Number(id);
    if (!paymentId) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }

    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query(
        'DELETE FROM casino_payments WHERE id = ? AND casino_id = ?',
        [paymentId, Number(casinoId)]
      );

      const affected = (result as any).affectedRows as number;
      if (!affected) {
        res.status(404).json({ error: 'Payment not found' });
        return;
      }

      res.json({ message: 'Payment deleted' });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    console.error('deleteCasinoPayment error:', e);
    res.status(500).json({ error: 'Failed to delete payment' });
  }
};

export const uploadPaymentImages = (req: Request, res: Response): void => {
  paymentImageUpload(req, res, async (err) => {
    if (err) {
      console.error('Error uploading payment images:', err);
      res.status(400).json({ error: err.message || 'Failed to upload images' });
      return;
    }

    try {
      const { casinoId, paymentId } = req.params;
      const files = (req as any).files as Express.Multer.File[] | undefined;

      if (!files || files.length === 0) {
        res.status(400).json({ error: 'No files provided' });
        return;
      }

      const connection = await pool.getConnection();
      try {
        const uploadedImages: CasinoPaymentImage[] = [];

        for (const file of files) {
          const relativePath = path.join('payments', path.basename(file.path));

          await connection.query(
            `INSERT INTO casino_payment_images (casino_id, payment_id, file_path, original_name)
             VALUES (?, ?, ?, ?)`,
            [Number(casinoId), Number(paymentId), relativePath, file.originalname]
          );

          const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT * FROM casino_payment_images WHERE casino_id = ? AND payment_id = ? ORDER BY created_at DESC LIMIT 1`,
            [Number(casinoId), Number(paymentId)]
          );

          const image = rows[0] as unknown as CasinoPaymentImage;
          uploadedImages.push({
            ...image,
            url: `/api/uploads/${image.file_path}`,
          });
        }

        res.status(201).json(uploadedImages);
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Error saving payment images:', error);
      res.status(500).json({ error: 'Failed to save images' });
    }
  });
};

export const getPaymentImages = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const connection = await pool.getConnection();

    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT * FROM casino_payment_images WHERE payment_id = ? ORDER BY created_at DESC`,
      [paymentId]
    );

    connection.release();

    const images = (rows as unknown as CasinoPaymentImage[]).map((img) => ({
      ...img,
      url: `/api/uploads/${img.file_path}`,
    }));

    res.json(images);
  } catch (error) {
    console.error('Error fetching payment images:', error);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
};

export const deletePaymentImage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { imageId } = req.params;
    const connection = await pool.getConnection();

    // Get image info before deleting
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT * FROM casino_payment_images WHERE id = ?`,
      [imageId]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      connection.release();
      res.status(404).json({ error: 'Image not found' });
      return;
    }

    const image = rows[0] as unknown as CasinoPaymentImage;

    // Delete from database
    await connection.query(`DELETE FROM casino_payment_images WHERE id = ?`, [imageId]);
    connection.release();

    // Delete file from filesystem
    const filePath = path.join(uploadsRoot, image.file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Error deleting payment image:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
};
