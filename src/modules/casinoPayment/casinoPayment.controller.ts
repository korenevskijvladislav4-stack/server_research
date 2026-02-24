import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import { parseQueryParams } from '../../common/utils';
import { casinoPaymentService } from './casinoPayment.service';
import { sendError } from '../../common/response';
import { AuthRequest } from '../../middleware/auth.middleware';

const uploadsRoot = path.join(__dirname, '..', '..', '..', 'uploads');

export async function getAllPayments(req: Request, res: Response): Promise<void> {
  try {
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
      filters: normalizedFilters as any,
    });
    res.json(result);
  } catch (e) {
    console.error('getAllPayments error:', e);
    sendError(res, 500, 'Failed to load payments');
  }
}

export async function exportPaymentsXlsx(req: Request, res: Response): Promise<void> {
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

    const rows = await casinoPaymentService.getAllPaymentsForExport({
      search: searchValue,
      filters: normalizedFilters as any,
    });
    const payments = rows.map((p) => ({
      ...p,
      casino_name: (p as any).casinos?.name ?? '',
      casinos: undefined,
    }));

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
        id: (p as any).id,
        casino_name: (p as any).casino_name || '',
        casino_id: (p as any).casino_id,
        geo: (p as any).geo,
        direction: (p as any).direction === 'withdrawal' ? 'Выплата' : 'Депозит',
        type: (p as any).type,
        method: (p as any).method,
        min_amount: (p as any).min_amount,
        max_amount: (p as any).max_amount,
        currency: (p as any).currency,
        notes: (p as any).notes,
        created_at: (p as any).created_at,
        updated_at: (p as any).updated_at,
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
  } catch (e: any) {
    console.error('exportPaymentsXlsx error:', e?.message || e);
    sendError(res, 500, 'Failed to export payments');
  }
}

export async function listCasinoPayments(req: Request, res: Response): Promise<void> {
  try {
    const casinoId = Number(req.params.casinoId);
    const geo = req.query.geo as string | undefined;
    if (!casinoId) {
      sendError(res, 400, 'Invalid casinoId');
      return;
    }
    const list = await casinoPaymentService.listByCasino(casinoId, geo);
    res.json(list);
  } catch (e) {
    console.error('listCasinoPayments error:', e);
    sendError(res, 500, 'Failed to fetch payments');
  }
}

export async function createCasinoPayment(req: AuthRequest, res: Response): Promise<void> {
  try {
    const casinoId = Number(req.params.casinoId);
    if (!casinoId) {
      sendError(res, 400, 'Invalid casinoId');
      return;
    }
    const body = req.body ?? {};
    if (!body.geo || !body.type || !body.method) {
      sendError(res, 400, 'geo, type and method are required');
      return;
    }
    const payment = await casinoPaymentService.create(
      casinoId,
      body,
      req.user?.id ?? null
    );
    res.status(201).json(payment);
  } catch (e) {
    console.error('createCasinoPayment error:', e);
    sendError(res, 500, 'Failed to create payment');
  }
}

export async function updateCasinoPayment(req: AuthRequest, res: Response): Promise<void> {
  try {
    const casinoId = Number(req.params.casinoId);
    const id = Number(req.params.id);
    if (!casinoId || !id) {
      sendError(res, 400, 'Invalid ids');
      return;
    }
    const existing = await casinoPaymentService.getById(id, casinoId);
    if (!existing) {
      sendError(res, 404, 'Payment not found');
      return;
    }
    const updated = await casinoPaymentService.update(
      id,
      casinoId,
      req.body ?? {},
      req.user?.id ?? null
    );
    res.json(updated);
  } catch (e) {
    console.error('updateCasinoPayment error:', e);
    sendError(res, 500, 'Failed to update payment');
  }
}

export async function deleteCasinoPayment(req: AuthRequest, res: Response): Promise<void> {
  try {
    const casinoId = Number(req.params.casinoId);
    const id = Number(req.params.id);
    if (!casinoId || !id) {
      sendError(res, 400, 'Invalid ids');
      return;
    }
    const deleted = await casinoPaymentService.delete(id, casinoId);
    if (!deleted) {
      sendError(res, 404, 'Payment not found');
      return;
    }
    res.json({ message: 'Payment deleted' });
  } catch (e) {
    console.error('deleteCasinoPayment error:', e);
    sendError(res, 500, 'Failed to delete payment');
  }
}

export async function uploadPaymentImages(req: Request, res: Response): Promise<void> {
  try {
    const casinoId = Number(req.params.casinoId);
    const paymentId = Number(req.params.paymentId);
    const files = (req as any).files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      sendError(res, 400, 'No files provided');
      return;
    }
    const uploadedImages: any[] = [];
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
  } catch (e) {
    console.error('uploadPaymentImages error:', e);
    sendError(res, 500, 'Failed to save images');
  }
}

export async function getPaymentImages(req: Request, res: Response): Promise<void> {
  try {
    const paymentId = Number(req.params.paymentId);
    const images = await casinoPaymentService.getPaymentImages(paymentId);
    const result = images.map((img) => ({
      ...img,
      url: `/api/uploads/${img.file_path}`,
    }));
    res.json(result);
  } catch (e) {
    console.error('getPaymentImages error:', e);
    sendError(res, 500, 'Failed to fetch images');
  }
}

export async function deletePaymentImage(req: AuthRequest, res: Response): Promise<void> {
  try {
    const imageId = Number(req.params.imageId);
    const image = await casinoPaymentService.getPaymentImageById(imageId);
    if (!image) {
      sendError(res, 404, 'Image not found');
      return;
    }
    await casinoPaymentService.deletePaymentImage(imageId);
    const filePath = path.join(uploadsRoot, image.file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.json({ message: 'Image deleted successfully' });
  } catch (e) {
    console.error('deletePaymentImage error:', e);
    sendError(res, 500, 'Failed to delete image');
  }
}
