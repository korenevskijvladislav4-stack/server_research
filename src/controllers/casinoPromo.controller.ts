import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import ExcelJS from 'exceljs';
import pool from '../database/connection';
import { AuthRequest } from '../middleware/auth.middleware';
import { CasinoPromo, CreateCasinoPromoDto } from '../models/CasinoPromo';
import { CasinoPromoImage } from '../models/CasinoPromoImage';
import {
  parseQueryParams,
  buildWhereClause,
  buildLimitClause,
  calculateTotalPages,
} from '../common/utils';

const uploadsRoot = path.join(__dirname, '..', '..', 'uploads');
const promoImagesDir = path.join(uploadsRoot, 'promos');

if (!fs.existsSync(promoImagesDir)) {
  fs.mkdirSync(promoImagesDir, { recursive: true });
}

const promoImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, promoImagesDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || '';
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const promoImageUpload = multer({
  storage: promoImageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
}).array('images', 10);

// ---------------------------------------------------------------------------
// List all promos (global page with filters + pagination)
// ---------------------------------------------------------------------------

export const getAllPromos = async (req: Request, res: Response): Promise<void> => {
  try {
    const params = parseQueryParams(req.query);
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const searchValue = params.search ?? (req.query.search as string | undefined);

    const normalizedFilters = {
      ...params.filters,
      ...(req.query.casino_id ? { casino_id: req.query.casino_id } : {}),
      ...(req.query.geo ? { geo: req.query.geo } : {}),
      ...(req.query.promo_category ? { promo_category: req.query.promo_category } : {}),
      ...(req.query.promo_type ? { promo_type: req.query.promo_type } : {}),
      ...(req.query.status ? { status: req.query.status } : {}),
    };

    const conn = await pool.getConnection();
    const conditions: string[] = [];
    const queryParams: any[] = [];

    if (normalizedFilters && Object.keys(normalizedFilters).length > 0) {
      const { clause, params: filterParams } = buildWhereClause(
        normalizedFilters,
        ['casino_id', 'geo', 'promo_category', 'promo_type', 'status'],
        'p'
      );
      if (clause) {
        conditions.push(clause.replace('WHERE ', ''));
        queryParams.push(...filterParams);
      }
    }

    if (searchValue) {
      conditions.push('(p.name LIKE ? OR p.promo_type LIKE ? OR p.provider LIKE ? OR c.name LIKE ?)');
      const s = `%${searchValue}%`;
      queryParams.push(s, s, s, s);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { clause: limitClause, params: limitParams } = buildLimitClause(page, pageSize);

    const [countRows] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total
       FROM casino_promos p
       LEFT JOIN casinos c ON p.casino_id = c.id
       ${whereClause}`,
      queryParams
    );
    const total = Number((countRows[0] as any)?.total ?? 0);

    const sortFieldMap: Record<string, string> = {
      name: 'p.name',
      casino_name: 'c.name',
      geo: 'p.geo',
      promo_category: 'p.promo_category',
      period_start: 'p.period_start',
      created_at: 'p.created_at',
    };
    const sortField = params.sortField && sortFieldMap[params.sortField]
      ? sortFieldMap[params.sortField]
      : 'p.created_at';
    const sortOrder = params.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT p.*, c.name AS casino_name
       FROM casino_promos p
       LEFT JOIN casinos c ON p.casino_id = c.id
       ${whereClause}
       ORDER BY ${sortField} ${sortOrder}
       ${limitClause}`,
      [...queryParams, ...limitParams]
    );

    conn.release();

    res.json({
      data: rows as unknown as CasinoPromo[],
      pagination: { page, pageSize, total, totalPages: calculateTotalPages(total, pageSize) },
    });
  } catch (e: any) {
    console.error('getAllPromos error:', e?.message || e);
    res.status(500).json({ error: 'Failed to fetch promos' });
  }
};

// ---------------------------------------------------------------------------
// Export promos as XLSX
// ---------------------------------------------------------------------------

export const exportPromosXlsx = async (req: Request, res: Response): Promise<void> => {
  try {
    const searchValue = req.query.search as string | undefined;
    const normalizedFilters = {
      ...(req.query.casino_id ? { casino_id: req.query.casino_id } : {}),
      ...(req.query.geo ? { geo: req.query.geo } : {}),
      ...(req.query.promo_category ? { promo_category: req.query.promo_category } : {}),
      ...(req.query.promo_type ? { promo_type: req.query.promo_type } : {}),
      ...(req.query.status ? { status: req.query.status } : {}),
    };

    const conn = await pool.getConnection();
    const conditions: string[] = [];
    const queryParams: any[] = [];

    if (Object.keys(normalizedFilters).length > 0) {
      const { clause, params: filterParams } = buildWhereClause(
        normalizedFilters,
        ['casino_id', 'geo', 'promo_category', 'promo_type', 'status'],
        'p'
      );
      if (clause) {
        conditions.push(clause.replace('WHERE ', ''));
        queryParams.push(...filterParams);
      }
    }

    if (searchValue) {
      conditions.push('(p.name LIKE ? OR p.promo_type LIKE ? OR p.provider LIKE ? OR c.name LIKE ?)');
      const s = `%${searchValue}%`;
      queryParams.push(s, s, s, s);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT p.*, c.name AS casino_name
       FROM casino_promos p
       LEFT JOIN casinos c ON p.casino_id = c.id
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT 10000`,
      queryParams
    );
    conn.release();

    const promos = rows as any[];

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Промо');

    sheet.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'GEO', key: 'geo', width: 8 },
      { header: 'Конкурент', key: 'casino_name', width: 22 },
      { header: 'Тип турнира', key: 'promo_type', width: 18 },
      { header: 'Название турнира', key: 'name', width: 28 },
      { header: 'Период проведения', key: 'period', width: 22 },
      { header: 'Провайдер', key: 'provider', width: 18 },
      { header: 'Общий ПФ', key: 'prize_fund', width: 14 },
      { header: 'Механика', key: 'mechanics', width: 30 },
      { header: 'Мин. ставка для участия', key: 'min_bet', width: 20 },
      { header: 'Вейджер на приз', key: 'wagering_prize', width: 16 },
      { header: 'Категория', key: 'promo_category', width: 14 },
      { header: 'Статус', key: 'status', width: 10 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };

    const catLabels: Record<string, string> = { tournament: 'Турнир', promotion: 'Акция' };
    const statusLabels: Record<string, string> = { active: 'Активен', paused: 'Пауза', expired: 'Истёк', draft: 'Черновик' };

    for (const r of promos) {
      const periodStart = r.period_start ? new Date(r.period_start).toLocaleDateString('ru-RU') : '';
      const periodEnd = r.period_end ? new Date(r.period_end).toLocaleDateString('ru-RU') : '';
      sheet.addRow({
        id: r.id,
        geo: r.geo ?? '',
        casino_name: r.casino_name ?? '',
        promo_type: r.promo_type ?? '',
        name: r.name ?? '',
        period: periodStart && periodEnd ? `${periodStart} – ${periodEnd}` : periodStart || periodEnd || '',
        provider: r.provider ?? '',
        prize_fund: r.prize_fund ?? '',
        mechanics: r.mechanics ?? '',
        min_bet: r.min_bet ?? '',
        wagering_prize: r.wagering_prize ?? '',
        promo_category: catLabels[r.promo_category] ?? r.promo_category,
        status: statusLabels[r.status] ?? r.status,
      });
    }

    const filename = `promos_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (e: any) {
    console.error('exportPromosXlsx error:', e?.message || e);
    res.status(500).json({ error: 'Failed to export promos' });
  }
};

// ---------------------------------------------------------------------------
// List promos for a specific casino
// ---------------------------------------------------------------------------

export const listCasinoPromos = async (req: Request, res: Response): Promise<void> => {
  try {
    const { casinoId } = req.params;
    const { geo } = req.query;

    const conn = await pool.getConnection();
    const conditions = ['p.casino_id = ?'];
    const queryParams: any[] = [casinoId];

    if (geo) {
      conditions.push('p.geo = ?');
      queryParams.push(geo);
    }

    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT p.*, c.name AS casino_name
       FROM casino_promos p
       LEFT JOIN casinos c ON p.casino_id = c.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.created_at DESC`,
      queryParams
    );

    conn.release();
    res.json(rows as unknown as CasinoPromo[]);
  } catch (e: any) {
    console.error('listCasinoPromos error:', e?.message || e);
    res.status(500).json({ error: 'Failed to fetch casino promos' });
  }
};

// ---------------------------------------------------------------------------
// Create promo
// ---------------------------------------------------------------------------

export const createCasinoPromo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const casinoId = Number(req.params.casinoId);
    const body: CreateCasinoPromoDto = req.body ?? {};
    const userId = req.user?.id ?? null;

    if (!body.name || !body.geo) {
      res.status(400).json({ error: 'name and geo are required' });
      return;
    }

    const conn = await pool.getConnection();

    const [result] = await conn.query(
      `INSERT INTO casino_promos
       (casino_id, geo, promo_category, name, promo_type,
        period_start, period_end, provider, prize_fund, mechanics,
        min_bet, wagering_prize, status, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        casinoId,
        body.geo,
        body.promo_category ?? 'tournament',
        body.name,
        body.promo_type ?? null,
        body.period_start ?? null,
        body.period_end ?? null,
        body.provider ?? null,
        body.prize_fund ?? null,
        body.mechanics ?? null,
        body.min_bet ?? null,
        body.wagering_prize ?? null,
        body.status ?? 'active',
        userId,
        userId,
      ]
    );

    const insertId = (result as any).insertId;
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT p.*, c.name AS casino_name
       FROM casino_promos p
       LEFT JOIN casinos c ON p.casino_id = c.id
       WHERE p.id = ?`,
      [insertId]
    );
    conn.release();
    res.status(201).json(rows[0]);
  } catch (e: any) {
    console.error('createCasinoPromo error:', e?.message || e);
    res.status(500).json({ error: 'Failed to create promo' });
  }
};

// ---------------------------------------------------------------------------
// Update promo
// ---------------------------------------------------------------------------

export const updateCasinoPromo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { casinoId, id } = req.params;
    const body = req.body ?? {};
    const userId = req.user?.id ?? null;

    const fields: string[] = [];
    const values: any[] = [];

    const allowed = [
      'geo', 'promo_category', 'name', 'promo_type',
      'period_start', 'period_end', 'provider', 'prize_fund', 'mechanics',
      'min_bet', 'wagering_prize', 'status',
    ];

    for (const key of allowed) {
      if (key in body) {
        fields.push(`${key} = ?`);
        values.push(body[key]);
      }
    }

    if (fields.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    fields.push('updated_by = ?');
    values.push(userId);
    values.push(id, casinoId);

    const conn = await pool.getConnection();
    await conn.query(
      `UPDATE casino_promos SET ${fields.join(', ')} WHERE id = ? AND casino_id = ?`,
      values
    );

    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT p.*, c.name AS casino_name
       FROM casino_promos p
       LEFT JOIN casinos c ON p.casino_id = c.id
       WHERE p.id = ?`,
      [id]
    );
    conn.release();
    res.json(rows[0]);
  } catch (e: any) {
    console.error('updateCasinoPromo error:', e?.message || e);
    res.status(500).json({ error: 'Failed to update promo' });
  }
};

// ---------------------------------------------------------------------------
// Delete promo
// ---------------------------------------------------------------------------

export const deleteCasinoPromo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { casinoId, id } = req.params;
    const conn = await pool.getConnection();
    await conn.query('DELETE FROM casino_promos WHERE id = ? AND casino_id = ?', [id, casinoId]);
    conn.release();
    res.json({ success: true });
  } catch (e: any) {
    console.error('deleteCasinoPromo error:', e?.message || e);
    res.status(500).json({ error: 'Failed to delete promo' });
  }
};

export const uploadPromoImages = (req: Request, res: Response): void => {
  promoImageUpload(req, res, async (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Failed to upload images' });
      return;
    }

    try {
      const { casinoId, promoId } = req.params;
      const files = (req as any).files as Express.Multer.File[] | undefined;

      if (!files || files.length === 0) {
        res.status(400).json({ error: 'No files provided' });
        return;
      }

      const connection = await pool.getConnection();
      try {
        const uploadedImages: CasinoPromoImage[] = [];

        for (const file of files) {
          const fileName = path.basename(file.path);
          const relativePath = path.join('promos', fileName).replace(/\\/g, '/');

          await connection.query(
            `INSERT INTO casino_promo_images (casino_id, promo_id, file_path, original_name)
             VALUES (?, ?, ?, ?)`,
            [Number(casinoId), Number(promoId), relativePath, file.originalname]
          );

          const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT * FROM casino_promo_images WHERE casino_id = ? AND promo_id = ? ORDER BY created_at DESC LIMIT 1`,
            [Number(casinoId), Number(promoId)]
          );

          const image = rows[0] as unknown as CasinoPromoImage;
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
      res.status(500).json({ error: 'Failed to save images', details: error.message });
    }
  });
};

export const getPromoImages = async (req: Request, res: Response): Promise<void> => {
  try {
    const { promoId } = req.params;
    const connection = await pool.getConnection();

    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT * FROM casino_promo_images WHERE promo_id = ? ORDER BY created_at DESC`,
      [promoId]
    );

    connection.release();

    const images = (rows as unknown as CasinoPromoImage[]).map((img) => ({
      ...img,
      url: `/api/uploads/${img.file_path}`,
    }));

    res.json(images);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch images' });
  }
};

export const deletePromoImage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { imageId } = req.params;
    const connection = await pool.getConnection();

    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT * FROM casino_promo_images WHERE id = ?`,
      [imageId]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      connection.release();
      res.status(404).json({ error: 'Image not found' });
      return;
    }

    const image = rows[0] as unknown as CasinoPromoImage;
    await connection.query(`DELETE FROM casino_promo_images WHERE id = ?`, [imageId]);
    connection.release();

    const filePath = path.join(uploadsRoot, image.file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete image' });
  }
};
