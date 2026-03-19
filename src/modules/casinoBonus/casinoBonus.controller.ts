import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import type { Prisma, casino_bonuses, casino_bonus_images } from '@prisma/client';
import { parseQueryParams } from '../../common/utils';
import { casinoBonusService, type BonusFilters } from './casinoBonus.service';
import { extractBonusFromImage } from '../../services/ai-bonus-from-image.service';
import { AppError } from '../../errors/AppError';
import { AuthRequest } from '../../middleware/auth.middleware';

const uploadsRoot = path.join(__dirname, '..', '..', '..', 'uploads');

type BonusExportRow = Prisma.casino_bonusesGetPayload<{
  include: { casinos: { select: { name: true } } };
}>;

type BonusXlsxRow = Omit<BonusExportRow, 'casinos'> & { casino_name: string };

type AuthRequestWithFile = AuthRequest & { file?: Express.Multer.File };

function multerFilesArray(
  files: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] } | undefined,
): Express.Multer.File[] | undefined {
  if (!files) return undefined;
  if (Array.isArray(files)) return files;
  return Object.values(files).flat();
}

function formatBonusValue(
  b: Pick<casino_bonuses, 'bonus_kind' | 'cashback_percent' | 'bonus_value' | 'bonus_unit' | 'currency'>,
): string {
  if (b.bonus_kind === 'cashback' && b.cashback_percent != null) {
    return `${b.cashback_percent}%`;
  }
  const v = b.bonus_value;
  if (v == null) return '';
  const unit = b.bonus_unit;
  const cur = b.currency || '';
  if (unit === 'percent') return `${v}%`;
  if (unit === 'amount' && cur) return `${v} ${cur}`.trim();
  if (unit === 'amount') return String(v);
  return cur ? `${v} ${cur}`.trim() : String(v);
}

function formatMaxWin(
  value: casino_bonuses['max_win_cash_value'],
  unit: string | null,
  currency: string,
): string {
  if (value == null) return '';
  if (unit === 'coefficient') return `X${value}`;
  if (unit === 'fixed' && currency) return `${value} ${currency}`.trim();
  if (unit === 'fixed') return String(value);
  return currency ? `${value} ${currency}`.trim() || String(value) : String(value);
}

export async function getAllBonuses(req: Request, res: Response): Promise<void> {
  const params = parseQueryParams(req.query);
  const legacyLimit = Number(req.query.limit);
  const legacyOffset = Number(req.query.offset);
  const fallbackPageSize =
    Number.isFinite(legacyLimit) && legacyLimit > 0 ? legacyLimit : undefined;
  const fallbackPage =
    Number.isFinite(legacyLimit) &&
    legacyLimit > 0 &&
    Number.isFinite(legacyOffset) &&
    legacyOffset >= 0
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

  const result = await casinoBonusService.getAllBonuses({
    page,
    pageSize,
    sortField: params.sortField,
    sortOrder: params.sortOrder === 'asc' ? 'asc' : 'desc',
    search: searchValue,
    filters: normalizedFilters as BonusFilters,
  });
  res.json(result);
}

export async function exportBonusesXlsx(req: Request, res: Response): Promise<void> {
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

  const rows = await casinoBonusService.getAllBonusesForExport({
    search: searchValue,
    filters: normalizedFilters as BonusFilters,
  });
  const bonuses: BonusXlsxRow[] = rows.map((b) => {
    const { casinos, ...rest } = b;
    return {
      ...rest,
      casino_name: casinos?.name ?? '',
    };
  });

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
    { header: 'Мин. депозит', key: 'min_deposit', width: 14 },
    { header: 'Макс. бонус', key: 'max_bonus', width: 14 },
    { header: 'Макс. кэш-аут', key: 'max_cashout', width: 16 },
    { header: 'Период кешбека', key: 'cashback_period', width: 16 },
    { header: 'Макс. выигрыш (кэш)', key: 'max_win_cash_display', width: 18 },
    { header: 'Макс. выигрыш (фриспины)', key: 'max_win_freespin_display', width: 22 },
    { header: 'Макс. выигрыш (%)', key: 'max_win_percent_display', width: 18 },
    { header: 'Кол-во фриспинов', key: 'freespins_count', width: 16 },
    { header: 'Стоимость спина', key: 'freespin_value', width: 16 },
    { header: 'Игра для фриспинов', key: 'freespin_game', width: 22 },
    { header: 'Вейджер (кэш)', key: 'wagering_requirement', width: 14 },
    { header: 'Вейджер (фриспины)', key: 'wagering_freespin', width: 18 },
    { header: 'Время на отыгрыш', key: 'wagering_time_limit', width: 18 },
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
      cashback_period: b.cashback_period,
      min_deposit: b.min_deposit,
      max_bonus: b.max_bonus,
      max_cashout: b.max_cashout,
      max_win_cash_display: formatMaxWin(b.max_win_cash_value, b.max_win_cash_unit, cur),
      max_win_freespin_display: formatMaxWin(
        b.max_win_freespin_value,
        b.max_win_freespin_unit,
        cur,
      ),
      max_win_percent_display: formatMaxWin(
        b.max_win_percent_value,
        b.max_win_percent_unit,
        cur,
      ),
      wagering_requirement: b.wagering_requirement,
      wagering_freespin: b.wagering_freespin,
      wagering_time_limit: b.wagering_time_limit,
      wagering_games: b.wagering_games,
      promo_code: b.promo_code,
      valid_from: b.valid_from,
      valid_to: b.valid_to,
      notes: b.notes,
    });
  }
  const filename = `bonuses_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

export async function listCasinoBonuses(req: Request, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const geo = req.query.geo as string | undefined;
  if (!casinoId) {
    throw new AppError(400, 'Некорректный ID казино');
  }
  const list = await casinoBonusService.listByCasino(casinoId, geo);
  res.json(list);
}

export async function createCasinoBonus(req: AuthRequest, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  if (!casinoId) {
    throw new AppError(400, 'Некорректный ID казино');
  }
  const body = req.body ?? {};
  if (!body.geo || !body.name) {
    throw new AppError(400, 'geo and name are required');
  }
  const bonus = await casinoBonusService.create(
    casinoId,
    body,
    req.user?.id ?? null
  );
  res.status(201).json(bonus);
}

export async function updateCasinoBonus(req: AuthRequest, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const id = Number(req.params.id);
  if (!casinoId || !id) {
    throw new AppError(400, 'Некорректные параметры');
  }
  const existing = await casinoBonusService.getById(id, casinoId);
  if (!existing) {
    throw new AppError(404, 'Bonus not found');
  }
  const updated = await casinoBonusService.update(
    id,
    casinoId,
    req.body ?? {},
    req.user?.id ?? null
  );
  res.json(updated);
}

export async function deleteCasinoBonus(req: AuthRequest, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const id = Number(req.params.id);
  if (!casinoId || !id) {
    throw new AppError(400, 'Некорректные параметры');
  }
  const deleted = await casinoBonusService.delete(id, casinoId);
  if (!deleted) {
    throw new AppError(404, 'Bonus not found');
  }
  res.json({ message: 'Bonus deleted' });
}

export async function uploadBonusImages(req: Request, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const bonusId = Number(req.params.bonusId);
  const files = multerFilesArray(req.files);
  if (!files || files.length === 0) {
    throw new AppError(400, 'Файл не загружен');
  }
  const uploadedImages: (casino_bonus_images & { url: string })[] = [];
  for (const file of files) {
    const fileName = path.basename(file.path);
    const relativePath = path.join('bonuses', fileName).replace(/\\/g, '/');
    const img = await casinoBonusService.addBonusImage(
      casinoId,
      bonusId,
      relativePath,
      file.originalname
    );
    uploadedImages.push({
      ...img,
      url: `/api/uploads/${img.file_path}`,
    });
  }
  res.status(201).json(uploadedImages);
}

export async function getBonusImages(req: Request, res: Response): Promise<void> {
  const bonusId = Number(req.params.bonusId);
  const images = await casinoBonusService.getBonusImages(bonusId);
  const result = images.map((img) => ({
    ...img,
    url: `/api/uploads/${img.file_path}`,
  }));
  res.json(result);
}

export async function deleteBonusImage(req: AuthRequest, res: Response): Promise<void> {
  const imageId = Number(req.params.imageId);
  const image = await casinoBonusService.getBonusImageById(imageId);
  if (!image) {
    throw new AppError(404, 'Изображение не найдено');
  }
  await casinoBonusService.deleteBonusImage(imageId);
  const filePath = path.join(uploadsRoot, image.file_path);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  res.json({ message: 'Image deleted successfully' });
}

export async function analyzeBonusImage(req: AuthRequestWithFile, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  if (!casinoId) {
    throw new AppError(400, 'Некорректный ID казино');
  }

  const file = req.file;
  if (!file) {
    throw new AppError(400, 'Файл не загружен');
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new AppError(503, 'AI-извлечение бонусов не настроено');
  }

  const geo =
    (req.body?.geo as string | undefined) ||
    (req.query?.geo as string | undefined) ||
    undefined;

  const suggestions = await extractBonusFromImage(file.path, file.mimetype, { geo: geo ?? null });

  if (file.path && fs.existsSync(file.path)) {
    void fs.promises.unlink(file.path).catch(() => undefined);
  }

  if (!suggestions) {
    res.json({ suggestions: null });
    return;
  }

  res.json({ suggestions });
}
