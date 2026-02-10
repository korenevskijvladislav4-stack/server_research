import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import ExcelJS from 'exceljs';
import pool from '../database/connection';
import { AuthRequest } from '../middleware/auth.middleware';
import { CasinoBonus } from '../models/CasinoBonus';
import { CasinoBonusImage } from '../models/CasinoBonusImage';
import {
  parseQueryParams,
  buildWhereClause,
  buildLimitClause,
  calculateTotalPages,
} from '../common/utils';

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
      ...(req.query.bonus_category ? { bonus_category: req.query.bonus_category } : {}),
      ...(req.query.bonus_kind ? { bonus_kind: req.query.bonus_kind } : {}),
      ...(req.query.bonus_type ? { bonus_type: req.query.bonus_type } : {}),
      ...(req.query.status ? { status: req.query.status } : {}),
    };

    const sortFieldMap: Record<string, string> = {
      id: 'b.id',
      casino_id: 'b.casino_id',
      casino_name: 'c.name',
      geo: 'b.geo',
      name: 'b.name',
      bonus_category: 'b.bonus_category',
      bonus_kind: 'b.bonus_kind',
      bonus_type: 'b.bonus_type',
      status: 'b.status',
      created_at: 'b.created_at',
      updated_at: 'b.updated_at',
    };
    const sortField =
      params.sortField && sortFieldMap[params.sortField] ? sortFieldMap[params.sortField] : 'b.created_at';
    const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const conn = await pool.getConnection();
    const conditions: string[] = [];
    const queryParams: any[] = [];

    if (normalizedFilters && Object.keys(normalizedFilters).length > 0) {
      const { clause, params: filterParams } = buildWhereClause(
        normalizedFilters,
        ['casino_id', 'geo', 'bonus_category', 'bonus_kind', 'bonus_type', 'status'],
        'b'
      );
      if (clause) {
        conditions.push(clause.replace('WHERE ', ''));
        queryParams.push(...filterParams);
      }
    }

    if (searchValue) {
      conditions.push('(b.name LIKE ? OR b.promo_code LIKE ? OR c.name LIKE ?)');
      const searchPattern = `%${searchValue}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const [countResult] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM casino_bonuses b
       LEFT JOIN casinos c ON b.casino_id = c.id
       ${whereClause}`,
      queryParams
    );
    const total = Number((countResult[0] as any).total ?? 0);

    // Get data with pagination
    const { clause: limitClause, params: limitParams } = buildLimitClause(page, pageSize);
    const dataParams = [...queryParams, ...limitParams];
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT b.*, c.name as casino_name
       FROM casino_bonuses b
       LEFT JOIN casinos c ON b.casino_id = c.id
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
    console.error('getAllBonuses error:', e);
    res.status(500).json({ error: 'Failed to load bonuses' });
  }
};

// ---------------------------------------------------------------------------
// Export bonuses as XLSX (with filters)
// ---------------------------------------------------------------------------

export const exportBonusesXlsx = async (req: Request, res: Response): Promise<void> => {
  try {
    const params = parseQueryParams(req.query);
    const searchValue = params.search ?? (req.query.search as string | undefined);

    const normalizedFilters = {
      ...params.filters,
      ...(req.query.casino_id ? { casino_id: req.query.casino_id } : {}),
      ...(req.query.geo ? { geo: req.query.geo } : {}),
      ...(req.query.bonus_category ? { bonus_category: req.query.bonus_category } : {}),
      ...(req.query.bonus_kind ? { bonus_kind: req.query.bonus_kind } : {}),
      ...(req.query.bonus_type ? { bonus_type: req.query.bonus_type } : {}),
      ...(req.query.status ? { status: req.query.status } : {}),
    };

    const conn = await pool.getConnection();
    const conditions: string[] = [];
    const queryParams: any[] = [];

    if (normalizedFilters && Object.keys(normalizedFilters).length > 0) {
      const { clause, params: filterParams } = buildWhereClause(
        normalizedFilters,
        ['casino_id', 'geo', 'bonus_category', 'bonus_kind', 'bonus_type', 'status'],
        'b'
      );
      if (clause) {
        conditions.push(clause.replace('WHERE ', ''));
        queryParams.push(...filterParams);
      }
    }

    if (searchValue) {
      conditions.push('(b.name LIKE ? OR b.promo_code LIKE ? OR c.name LIKE ?)');
      const searchPattern = `%${searchValue}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT b.*, c.name as casino_name
       FROM casino_bonuses b
       LEFT JOIN casinos c ON b.casino_id = c.id
       ${whereClause}
       ORDER BY b.created_at DESC
       LIMIT 10000`,
      queryParams
    );

    conn.release();

    const bonuses = rows as any[];

    function formatBonusValue(b: any): string {
      const v = b.bonus_value;
      if (v == null) return '';
      const unit = b.bonus_unit;
      const cur = b.currency || '';
      if (unit === 'percent') return `${v}%`;
      if (unit === 'amount' && cur) return `${v} ${cur}`.trim();
      if (unit === 'amount') return String(v);
      return cur ? `${v} ${cur}`.trim() : String(v);
    }

    function formatMaxWin(value: any, unit: string | null, currency: string): string {
      if (value == null) return '';
      if (unit === 'coefficient') return `X${value}`;
      if (unit === 'fixed' && currency) return `${value} ${currency}`.trim();
      if (unit === 'fixed') return String(value);
      return currency ? `${value} ${currency}`.trim() || String(value) : String(value);
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Бонусы');

    sheet.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Казино', key: 'casino_name', width: 25 },
      { header: 'ID казино', key: 'casino_id', width: 10 },
      { header: 'GEO', key: 'geo', width: 8 },
      { header: 'Название бонуса', key: 'name', width: 30 },
      { header: 'Категория', key: 'bonus_category', width: 12 },
      { header: 'Вид бонуса', key: 'bonus_kind', width: 14 },
      { header: 'Тип бонуса', key: 'bonus_type', width: 14 },
      { header: 'Значение бонуса', key: 'bonus_value_display', width: 18 },
      { header: 'Валюта', key: 'currency', width: 10 },
      { header: 'Кол-во фриспинов', key: 'freespins_count', width: 16 },
      { header: 'Стоимость спина', key: 'freespin_value', width: 16 },
      { header: 'Игра для фриспинов', key: 'freespin_game', width: 22 },
      { header: 'Кешбек, %', key: 'cashback_percent', width: 12 },
      { header: 'Период кешбека', key: 'cashback_period', width: 16 },
      { header: 'Мин. депозит', key: 'min_deposit', width: 14 },
      { header: 'Макс. бонус', key: 'max_bonus', width: 14 },
      { header: 'Макс. кэш-аут', key: 'max_cashout', width: 16 },
      { header: 'Макс. выигрыш (кэш)', key: 'max_win_cash_display', width: 18 },
      { header: 'Макс. выигрыш (фриспины)', key: 'max_win_freespin_display', width: 22 },
      { header: 'Макс. выигрыш (%)', key: 'max_win_percent_display', width: 18 },
      { header: 'Вейджер', key: 'wagering_requirement', width: 10 },
      { header: 'Игры для отыгрыша', key: 'wagering_games', width: 22 },
      { header: 'Промокод', key: 'promo_code', width: 16 },
      { header: 'Начало действия', key: 'valid_from', width: 18 },
      { header: 'Окончание действия', key: 'valid_to', width: 18 },
      { header: 'Заметки', key: 'notes', width: 40 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };

    for (const b of bonuses) {
      const cur = b.currency || '';
      sheet.addRow({
        id: b.id,
        casino_name: b.casino_name || '',
        casino_id: b.casino_id,
        geo: b.geo,
        name: b.name,
        bonus_category: b.bonus_category,
        bonus_kind: b.bonus_kind,
        bonus_type: b.bonus_type,
        bonus_value_display: formatBonusValue(b),
        currency: b.currency,
        freespins_count: b.freespins_count,
        freespin_value: b.freespin_value,
        freespin_game: b.freespin_game,
        cashback_percent: b.cashback_percent,
        cashback_period: b.cashback_period,
        min_deposit: b.min_deposit,
        max_bonus: b.max_bonus,
        max_cashout: b.max_cashout,
        max_win_cash_display: formatMaxWin(b.max_win_cash_value, b.max_win_cash_unit, cur),
        max_win_freespin_display: formatMaxWin(b.max_win_freespin_value, b.max_win_freespin_unit, cur),
        max_win_percent_display: formatMaxWin(b.max_win_percent_value, b.max_win_percent_unit, cur),
        wagering_requirement: b.wagering_requirement,
        wagering_games: b.wagering_games,
        promo_code: b.promo_code,
        valid_from: b.valid_from,
        valid_to: b.valid_to,
        notes: b.notes,
      });
    }

    const filename = `bonuses_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (e: any) {
    console.error('exportBonusesXlsx error:', e?.message || e);
    res.status(500).json({ error: 'Failed to export bonuses' });
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
      max_win_cash_value,
      max_win_cash_unit,
      max_win_freespin_value,
      max_win_freespin_unit,
      max_win_percent_value,
      max_win_percent_unit,
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
        min_deposit, max_bonus, max_cashout, max_win_cash_value, max_win_cash_unit, max_win_freespin_value, max_win_freespin_unit, max_win_percent_value, max_win_percent_unit,
        wagering_requirement, wagering_games, promo_code, valid_from, valid_to, status, notes, created_by, updated_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
        max_win_cash_value ?? null,
        max_win_cash_unit ?? null,
        max_win_freespin_value ?? null,
        max_win_freespin_unit ?? null,
        max_win_percent_value ?? null,
        max_win_percent_unit ?? null,
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
    const body = req.body ?? {};

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

    const toNum = (v: unknown): number | null =>
      v === '' || v === undefined || v === null ? null : Number(v);
    const toStr = (v: unknown): string | null =>
      v === '' || v === undefined || v === null ? null : String(v);

    // Все обновляемые колонки в фиксированном порядке (включая максвин)
    const updateColumns: [string, unknown][] = [
      ['geo', body.geo],
      ['name', body.name],
      ['bonus_category', body.bonus_category],
      ['bonus_kind', body.bonus_kind],
      ['bonus_type', body.bonus_type],
      ['bonus_value', body.bonus_value],
      ['bonus_unit', body.bonus_unit],
      ['currency', body.currency],
      ['freespins_count', body.freespins_count],
      ['freespin_value', body.freespin_value],
      ['freespin_game', body.freespin_game],
      ['cashback_percent', body.cashback_percent],
      ['cashback_period', body.cashback_period],
      ['min_deposit', body.min_deposit],
      ['max_bonus', body.max_bonus],
      ['max_cashout', body.max_cashout],
      ['max_win_cash_value', toNum(body.max_win_cash_value)],
      ['max_win_cash_unit', toStr(body.max_win_cash_unit)],
      ['max_win_freespin_value', toNum(body.max_win_freespin_value)],
      ['max_win_freespin_unit', toStr(body.max_win_freespin_unit)],
      ['max_win_percent_value', toNum(body.max_win_percent_value)],
      ['max_win_percent_unit', toStr(body.max_win_percent_unit)],
      ['wagering_requirement', body.wagering_requirement],
      ['wagering_games', body.wagering_games],
      ['promo_code', body.promo_code],
      ['valid_from', body.valid_from],
      ['valid_to', body.valid_to],
      ['status', body.status],
      ['notes', body.notes],
    ];

    const sets: string[] = [];
    const values: any[] = [];
    const maxWinCols = ['max_win_cash_value', 'max_win_cash_unit', 'max_win_freespin_value', 'max_win_freespin_unit', 'max_win_percent_value', 'max_win_percent_unit'];
    for (const [col, val] of updateColumns) {
      if (maxWinCols.includes(col)) {
        continue;
      }
      if (col in body) {
        sets.push(`${col} = ?`);
        values.push(val === undefined ? null : val);
      }
    }

    sets.push('updated_by = ?');
    values.push(actorId);
    values.push(id, casinoId);

    if (sets.length > 1) {
      await conn.query(
        `UPDATE casino_bonuses SET ${sets.join(', ')} WHERE id = ? AND casino_id = ?`,
        values
      );
    }

    // Отдельный UPDATE только для полей максвина (гарантированно применяется из req.body)
    const maxWinValues = [
      toNum(body.max_win_cash_value),
      toStr(body.max_win_cash_unit),
      toNum(body.max_win_freespin_value),
      toStr(body.max_win_freespin_unit),
      toNum(body.max_win_percent_value),
      toStr(body.max_win_percent_unit),
      id,
      casinoId,
    ];
    await conn.query(
      `UPDATE casino_bonuses SET
        max_win_cash_value = ?,
        max_win_cash_unit = ?,
        max_win_freespin_value = ?,
        max_win_freespin_unit = ?,
        max_win_percent_value = ?,
        max_win_percent_unit = ?
      WHERE id = ? AND casino_id = ?`,
      maxWinValues
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
