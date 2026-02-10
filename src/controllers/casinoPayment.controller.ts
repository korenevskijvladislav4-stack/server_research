import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import ExcelJS from 'exceljs';
import pool from '../database/connection';
import {
  CasinoPayment,
  CreateCasinoPaymentDto,
  UpdateCasinoPaymentDto,
} from '../models/CasinoPayment';
import { CasinoPaymentImage } from '../models/CasinoPaymentImage';
import {
  parseQueryParams,
  buildWhereClause,
  buildLimitClause,
  calculateTotalPages,
} from '../common/utils';

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
    const params = parseQueryParams(req.query);

    const legacyLimit = Number(req.query.limit);
    const legacyOffset = Number(req.query.offset);
    const fallbackPageSize =
      Number.isFinite(legacyLimit) && legacyLimit > 0 ? legacyLimit : undefined;
    const fallbackPage =
      Number.isFinite(legacyLimit) && legacyLimit > 0 && Number.isFinite(legacyOffset) && legacyOffset >= 0
        ? Math.floor(legacyOffset / legacyLimit) + 1
        : undefined;

    const page = params.page ?? fallbackPage ?? 1;
    const pageSize = params.pageSize ?? fallbackPageSize ?? 20;
    const searchValue = params.search ?? (req.query.search as string | undefined);

    const normalizedFilters = {
      ...params.filters,
      ...(req.query.casino_id ? { casino_id: req.query.casino_id } : {}),
      ...(req.query.geo ? { geo: req.query.geo } : {}),
      ...(req.query.type ? { type: req.query.type } : {}),
      ...(req.query.method ? { method: req.query.method } : {}),
      ...(req.query.direction ? { direction: req.query.direction } : {}),
    };

    const sortFieldMap: Record<string, string> = {
      id: 'p.id',
      casino_id: 'p.casino_id',
      casino_name: 'c.name',
      geo: 'p.geo',
      direction: 'p.direction',
      type: 'p.type',
      method: 'p.method',
      min_amount: 'p.min_amount',
      max_amount: 'p.max_amount',
      currency: 'p.currency',
      created_at: 'p.created_at',
      updated_at: 'p.updated_at',
    };
    const sortField =
      params.sortField && sortFieldMap[params.sortField] ? sortFieldMap[params.sortField] : 'p.created_at';
    const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const conn = await pool.getConnection();
    const conditions: string[] = [];
    const queryParams: any[] = [];

    if (normalizedFilters && Object.keys(normalizedFilters).length > 0) {
      const { clause, params: filterParams } = buildWhereClause(
        normalizedFilters,
        ['casino_id', 'geo', 'type', 'method', 'direction'],
        'p'
      );
      if (clause) {
        conditions.push(clause.replace('WHERE ', ''));
        queryParams.push(...filterParams);
      }
    }

    if (searchValue) {
      conditions.push('(p.type LIKE ? OR p.method LIKE ? OR c.name LIKE ?)');
      const searchPattern = `%${searchValue}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const [countResult] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM casino_payments p
       LEFT JOIN casinos c ON p.casino_id = c.id
       ${whereClause}`,
      queryParams
    );
    const total = Number((countResult[0] as any).total ?? 0);

    // Get data with pagination
    const { clause: limitClause, params: limitParams } = buildLimitClause(page, pageSize);
    const dataParams = [...queryParams, ...limitParams];
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT p.*, c.name as casino_name
       FROM casino_payments p
       LEFT JOIN casinos c ON p.casino_id = c.id
       ${whereClause}
       ORDER BY ${sortField} ${sortOrder}
       ${limitClause}`,
      dataParams
    );

    conn.release();

    res.json({
      data: rows,
      total,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: calculateTotalPages(total, pageSize),
      },
    });
  } catch (e) {
    console.error('getAllPayments error:', e);
    res.status(500).json({ error: 'Failed to load payments' });
  }
};

// ---------------------------------------------------------------------------
// Export payments as XLSX (with filters)
// ---------------------------------------------------------------------------

export const exportPaymentsXlsx = async (req: Request, res: Response): Promise<void> => {
  try {
    const params = parseQueryParams(req.query);
    const searchValue = params.search ?? (req.query.search as string | undefined);

    const normalizedFilters = {
      ...params.filters,
      ...(req.query.casino_id ? { casino_id: req.query.casino_id } : {}),
      ...(req.query.geo ? { geo: req.query.geo } : {}),
      ...(req.query.type ? { type: req.query.type } : {}),
      ...(req.query.method ? { method: req.query.method } : {}),
      ...(req.query.direction ? { direction: req.query.direction } : {}),
    };

    const conn = await pool.getConnection();
    const conditions: string[] = [];
    const queryParams: any[] = [];

    if (normalizedFilters && Object.keys(normalizedFilters).length > 0) {
      const { clause, params: filterParams } = buildWhereClause(
        normalizedFilters,
        ['casino_id', 'geo', 'type', 'method', 'direction'],
        'p'
      );
      if (clause) {
        conditions.push(clause.replace('WHERE ', ''));
        queryParams.push(...filterParams);
      }
    }

    if (searchValue) {
      conditions.push('(p.type LIKE ? OR p.method LIKE ? OR c.name LIKE ?)');
      const searchPattern = `%${searchValue}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT p.*, c.name as casino_name
       FROM casino_payments p
       LEFT JOIN casinos c ON p.casino_id = c.id
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT 10000`,
      queryParams
    );

    conn.release();

    const payments = rows as any[];

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Платежи');

    sheet.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Казино', key: 'casino_name', width: 25 },
      { header: 'ID казино', key: 'casino_id', width: 10 },
      { header: 'GEO', key: 'geo', width: 8 },
      { header: 'Направление', key: 'direction', width: 12 },
      { header: 'Тип', key: 'type', width: 18 },
      { header: 'Метод', key: 'method', width: 18 },
      { header: 'Мин. сумма', key: 'min_amount', width: 14 },
      { header: 'Макс. сумма', key: 'max_amount', width: 14 },
      { header: 'Валюта', key: 'currency', width: 10 },
      { header: 'Заметки', key: 'notes', width: 40 },
      { header: 'Создано', key: 'created_at', width: 20 },
      { header: 'Обновлено', key: 'updated_at', width: 20 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };

    for (const p of payments) {
      sheet.addRow({
        id: p.id,
        casino_name: p.casino_name || '',
        casino_id: p.casino_id,
        geo: p.geo,
        direction: p.direction === 'withdrawal' ? 'Выплата' : 'Депозит',
        type: p.type,
        method: p.method,
        min_amount: p.min_amount,
        max_amount: p.max_amount,
        currency: p.currency,
        notes: p.notes,
        created_at: p.created_at,
        updated_at: p.updated_at,
      });
    }

    const filename = `payments_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (e: any) {
    console.error('exportPaymentsXlsx error:', e?.message || e);
    res.status(500).json({ error: 'Failed to export payments' });
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
