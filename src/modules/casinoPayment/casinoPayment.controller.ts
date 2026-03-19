import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import type { Prisma, casino_payment_images } from '@prisma/client';
import { parseQueryParams } from '../../common/utils';
import { casinoPaymentService, type PaymentFilters } from './casinoPayment.service';
import { AppError } from '../../errors/AppError';
import { AuthRequest } from '../../middleware/auth.middleware';

const uploadsRoot = path.join(__dirname, '..', '..', '..', 'uploads');

type PaymentExportRow = Prisma.casino_paymentsGetPayload<{
  include: { casinos: { select: { name: true } } };
}>;

type PaymentXlsxRow = Omit<PaymentExportRow, 'casinos'> & { casino_name: string };

function multerFilesArray(
  files: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] } | undefined,
): Express.Multer.File[] | undefined {
  if (!files) return undefined;
  if (Array.isArray(files)) return files;
  return Object.values(files).flat();
}

export async function getAllPayments(req: Request, res: Response): Promise<void> {
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
    ...(req.query.type ? { type: req.query.type } : {}),
    ...(req.query.method ? { method: req.query.method } : {}),
    ...(req.query.direction ? { direction: req.query.direction } : {}),
  };

  const result = await casinoPaymentService.getAllPayments({
    page,
    pageSize,
    sortField: params.sortField,
    sortOrder: params.sortOrder === 'asc' ? 'asc' : 'desc',
    search: searchValue,
    filters: normalizedFilters as PaymentFilters,
  });
  res.json(result);
}

export async function exportPaymentsXlsx(req: Request, res: Response): Promise<void> {
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

  const rows = await casinoPaymentService.getAllPaymentsForExport({
    search: searchValue,
    filters: normalizedFilters as PaymentFilters,
  });
  const payments: PaymentXlsxRow[] = rows.map((p) => {
    const { casinos, ...rest } = p;
    return {
      ...rest,
      casino_name: casinos?.name ?? '',
    };
  });

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
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

export async function listCasinoPayments(req: Request, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const geo = req.query.geo as string | undefined;
  if (!casinoId) {
    throw new AppError(400, 'Некорректный ID казино');
  }
  const list = await casinoPaymentService.listByCasino(casinoId, geo);
  res.json(list);
}

export async function createCasinoPayment(req: AuthRequest, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  if (!casinoId) {
    throw new AppError(400, 'Некорректный ID казино');
  }
  const body = req.body ?? {};
  if (!body.geo || !body.type || !body.method) {
    throw new AppError(400, 'GEO, тип и метод обязательны');
  }
  const payment = await casinoPaymentService.create(
    casinoId,
    body,
    req.user?.id ?? null
  );
  res.status(201).json(payment);
}

export async function updateCasinoPayment(req: AuthRequest, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const id = Number(req.params.id);
  if (!casinoId || !id) {
    throw new AppError(400, 'Некорректные параметры');
  }
  const existing = await casinoPaymentService.getById(id, casinoId);
  if (!existing) {
    throw new AppError(404, 'Платёжный метод не найден');
  }
  const updated = await casinoPaymentService.update(
    id,
    casinoId,
    req.body ?? {},
    req.user?.id ?? null
  );
  res.json(updated);
}

export async function deleteCasinoPayment(req: AuthRequest, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const id = Number(req.params.id);
  if (!casinoId || !id) {
    throw new AppError(400, 'Некорректные параметры');
  }
  const deleted = await casinoPaymentService.delete(id, casinoId);
  if (!deleted) {
    throw new AppError(404, 'Платёжный метод не найден');
  }
  res.json({ message: 'Payment deleted' });
}

export async function uploadPaymentImages(req: Request, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const paymentId = Number(req.params.paymentId);
  const files = multerFilesArray(req.files);
  if (!files || files.length === 0) {
    throw new AppError(400, 'Файл не загружен');
  }
  const uploadedImages: (casino_payment_images & { url: string })[] = [];
  for (const file of files) {
    const relativePath = path.join('payments', path.basename(file.path)).replace(/\\/g, '/');
    const img = await casinoPaymentService.addPaymentImage(
      casinoId,
      paymentId,
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

export async function getPaymentImages(req: Request, res: Response): Promise<void> {
  const paymentId = Number(req.params.paymentId);
  const images = await casinoPaymentService.getPaymentImages(paymentId);
  const result = images.map((img) => ({
    ...img,
    url: `/api/uploads/${img.file_path}`,
  }));
  res.json(result);
}

export async function deletePaymentImage(req: AuthRequest, res: Response): Promise<void> {
  const imageId = Number(req.params.imageId);
  const image = await casinoPaymentService.getPaymentImageById(imageId);
  if (!image) {
    throw new AppError(404, 'Изображение не найдено');
  }
  await casinoPaymentService.deletePaymentImage(imageId);
  const filePath = path.join(uploadsRoot, image.file_path);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  res.json({ message: 'Image deleted successfully' });
}
