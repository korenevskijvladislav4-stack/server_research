import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import { parseQueryParams } from '../../common/utils';
import { casinoPromoService } from './casinoPromo.service';
import { AppError } from '../../errors/AppError';
import { AuthRequest } from '../../middleware/auth.middleware';

const uploadsRoot = path.join(__dirname, '..', '..', '..', 'uploads');

export async function getAllPromos(req: Request, res: Response): Promise<void> {
  const params = parseQueryParams(req.query);
  const filters = {
    ...params.filters,
    ...(req.query.casino_id && { casino_id: req.query.casino_id }),
    ...(req.query.geo && { geo: req.query.geo }),
    ...(req.query.promo_category && { promo_category: req.query.promo_category }),
    ...(req.query.promo_type && { promo_type: req.query.promo_type }),
    ...(req.query.status && { status: req.query.status }),
  };
  const result = await casinoPromoService.getAll({
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    sortField: params.sortField,
    sortOrder: params.sortOrder === 'asc' ? 'asc' : 'desc',
    search: params.search ?? (req.query.search as string),
    filters: filters as any,
  });
  res.json(result);
}

export async function exportPromosXlsx(req: Request, res: Response): Promise<void> {
  const filters = {
    ...(req.query.casino_id && { casino_id: req.query.casino_id }),
    ...(req.query.geo && { geo: req.query.geo }),
    ...(req.query.promo_category && { promo_category: req.query.promo_category }),
    ...(req.query.promo_type && { promo_type: req.query.promo_type }),
    ...(req.query.status && { status: req.query.status }),
  };
  const rows = await casinoPromoService.getAllForExport({
    search: req.query.search as string,
    filters: filters as any,
  });
  const promos = rows.map((p) => ({ ...p, casino_name: (p as any).casinos?.name ?? '', casinos: undefined }));
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Промо');
  const catLabels: Record<string, string> = {
    tournament: 'Турнир',
    promotion: 'Акция',
    lottery: 'Лотерея',
  };
  const statusLabels: Record<string, string> = { active: 'Активен', paused: 'Пауза', expired: 'Истёк', draft: 'Черновик' };
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
    { header: 'С кнопкой', key: 'has_participation_button', width: 12 },
    { header: 'Статус', key: 'status', width: 10 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const r of promos) {
    const b = r as any;

    let periodText = '';
    if (b.period_type === 'daily') {
      periodText = 'Ежедневный';
    } else if (b.period_type === 'weekly') {
      periodText = 'Еженедельный';
    } else if (b.period_type === 'monthly') {
      periodText = 'Ежемесячный';
    } else {
      const ps = b.period_start ? new Date(b.period_start).toLocaleDateString('ru-RU') : '';
      const pe = b.period_end ? new Date(b.period_end).toLocaleDateString('ru-RU') : '';
      periodText = ps && pe ? `${ps} – ${pe}` : ps || pe || '';
    }
    sheet.addRow({
      id: b.id,
      geo: b.geo ?? '',
      casino_name: b.casino_name ?? '',
      promo_type: b.promo_type ?? '',
      name: b.name ?? '',
      period: periodText,
      provider: b.provider ?? '',
      prize_fund: b.prize_fund ?? '',
      mechanics: b.mechanics ?? '',
      min_bet: b.min_bet ?? '',
      wagering_prize: b.wagering_prize ?? '',
      promo_category: catLabels[b.promo_category] ?? b.promo_category,
      has_participation_button:
        b.has_participation_button === true
          ? 'Да'
          : b.has_participation_button === false
          ? 'Нет'
          : '',
      status: statusLabels[b.status] ?? b.status,
    });
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="promos_export_${new Date().toISOString().slice(0, 10)}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

export async function listCasinoPromos(req: Request, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const geoRaw = req.query.geo;
  const geos: string[] = (Array.isArray(geoRaw) ? geoRaw.map(String) : (geoRaw ? [String(geoRaw)] : [])).filter(Boolean);
  const list = await casinoPromoService.listByCasino(casinoId, geos.length > 0 ? geos : undefined);
  res.json(list.map((p) => ({ ...p, casino_name: (p as any).casinos?.name ?? null, casinos: undefined })));
}

export async function createCasinoPromo(req: AuthRequest, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const body = req.body ?? {};
  if (!body.name || !body.geo) {
    throw new AppError(400, 'Название и GEO обязательны');
  }
  const promo = await casinoPromoService.create(casinoId, body, req.user?.id ?? null);
  res.status(201).json(promo);
}

export async function updateCasinoPromo(req: AuthRequest, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const id = Number(req.params.id);
  const existing = await casinoPromoService.getById(id, casinoId);
  if (!existing) {
    throw new AppError(404, 'Промо не найдено');
  }
  const body = req.body ?? {};
  if (Object.keys(body).length === 0) {
    throw new AppError(400, 'Нет полей для обновления');
  }
  const updated = await casinoPromoService.update(id, casinoId, body, req.user?.id ?? null);
  res.json(updated);
}

export async function deleteCasinoPromo(req: AuthRequest, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const id = Number(req.params.id);
  const deleted = await casinoPromoService.delete(id, casinoId);
  if (!deleted) {
    throw new AppError(404, 'Промо не найдено');
  }
  res.json({ success: true });
}

export async function uploadPromoImages(req: Request, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const promoId = Number(req.params.promoId);
  const files = (req as any).files as Express.Multer.File[] | undefined;
  if (!files?.length) {
    throw new AppError(400, 'Файл не загружен');
  }
  const uploaded: any[] = [];
  for (const file of files) {
    const relativePath = path.join('promos', path.basename(file.path)).replace(/\\/g, '/');
    const img = await casinoPromoService.addImage(casinoId, promoId, relativePath, file.originalname);
    uploaded.push({ ...img, url: `/api/uploads/${img.file_path}` });
  }
  res.status(201).json(uploaded);
}

export async function getPromoImages(req: Request, res: Response): Promise<void> {
  const promoId = Number(req.params.promoId);
  const images = await casinoPromoService.getImages(promoId);
  res.json(images.map((img) => ({ ...img, url: `/api/uploads/${img.file_path}` })));
}

export async function deletePromoImage(req: AuthRequest, res: Response): Promise<void> {
  const imageId = Number(req.params.imageId);
  const image = await casinoPromoService.getImageById(imageId);
  if (!image) {
    throw new AppError(404, 'Изображение не найдено');
  }
  await casinoPromoService.deleteImage(imageId);
  const filePath = path.join(uploadsRoot, image.file_path);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ message: 'Image deleted successfully' });
}
