import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import type { casino_loyalty_status_images } from '@prisma/client';
import { AuthRequest } from '../../middleware/auth.middleware';
import { AppError } from '../../errors/AppError';
import { casinoLoyaltyService, LoyaltyStatusInput } from './casinoLoyalty.service';
import { extractLoyaltyFromImage } from '../../services/ai-loyalty-from-image.service';
import { extractLoyaltyStatusFromImage } from '../../services/ai-loyalty-status-from-image.service';
import { formatPlainTextToMarkdown } from '../../services/ai-format-markdown.service';

const uploadsRoot = path.join(__dirname, '..', '..', '..', 'uploads');

type AuthRequestWithFile = AuthRequest & { file?: Express.Multer.File };

function multerFilesArray(
  files: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] } | undefined,
): Express.Multer.File[] | undefined {
  if (!files) return undefined;
  if (Array.isArray(files)) return files;
  const first = Object.values(files)[0];
  return Array.isArray(first) ? first : undefined;
}

function parseOrientation(v: unknown): 'casino' | 'sport' | null {
  if (v === 'casino' || v === 'sport') return v;
  return null;
}

export async function listLoyaltyPrograms(req: AuthRequest, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  if (!casinoId) throw new AppError(400, 'Некорректный ID казино');
  const geo = typeof req.query.geo === 'string' ? req.query.geo : undefined;
  const rows = await casinoLoyaltyService.listForCasino(casinoId, geo);
  res.json(rows);
}

export async function getLoyaltyProgram(req: AuthRequest, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const programId = Number(req.params.programId);
  if (!casinoId || !programId) throw new AppError(400, 'Некорректные параметры');
  const row = await casinoLoyaltyService.getById(casinoId, programId);
  if (!row) throw new AppError(404, 'Не найдено');
  res.json(row);
}

export async function createLoyaltyProgram(req: AuthRequest, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  if (!casinoId) throw new AppError(400, 'Некорректный ID казино');
  const body = req.body ?? {};
  const orientation = parseOrientation(body.orientation);
  if (!orientation) throw new AppError(400, 'Укажите orientation: casino или sport');

  const statuses: LoyaltyStatusInput[] = Array.isArray(body.statuses)
    ? body.statuses.map((s: { name?: string; description_md?: string }) => ({
        name: String(s?.name ?? ''),
        description_md: String(s?.description_md ?? ''),
      }))
    : [];

  try {
    const row = await casinoLoyaltyService.create(casinoId, {
      geo: String(body.geo ?? ''),
      orientation,
      conditions_md: String(body.conditions_md ?? ''),
      statuses,
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    const err = e as Error & { statusCode?: number };
    if (err.statusCode === 409) throw new AppError(409, err.message);
    throw e;
  }
}

export async function updateLoyaltyProgram(req: AuthRequest, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const programId = Number(req.params.programId);
  if (!casinoId || !programId) throw new AppError(400, 'Некорректные параметры');
  const body = req.body ?? {};

  const patch: Parameters<typeof casinoLoyaltyService.update>[2] = {};
  if (body.geo !== undefined) patch.geo = String(body.geo);
  if (body.orientation !== undefined) {
    const o = parseOrientation(body.orientation);
    if (!o) throw new AppError(400, 'orientation: casino или sport');
    patch.orientation = o;
  }
  if (body.conditions_md !== undefined) patch.conditions_md = String(body.conditions_md);
  if (body.statuses !== undefined) {
    if (!Array.isArray(body.statuses)) throw new AppError(400, 'statuses должен быть массивом');
    patch.statuses = body.statuses.map(
      (s: { id?: unknown; name?: string; description_md?: string }) => {
        const rawId = s?.id;
        const id =
          rawId != null && Number.isFinite(Number(rawId)) && Number(rawId) > 0
            ? Number(rawId)
            : undefined;
        return {
          ...(id ? { id } : {}),
          name: String(s?.name ?? ''),
          description_md: String(s?.description_md ?? ''),
        };
      },
    );
  }

  try {
    const row = await casinoLoyaltyService.update(casinoId, programId, patch);
    if (!row) throw new AppError(404, 'Не найдено');
    res.json(row);
  } catch (e: unknown) {
    const err = e as Error & { statusCode?: number };
    if (err.statusCode === 409) throw new AppError(409, err.message);
    throw e;
  }
}

export async function deleteLoyaltyProgram(req: AuthRequest, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const programId = Number(req.params.programId);
  if (!casinoId || !programId) throw new AppError(400, 'Некорректные параметры');
  const ok = await casinoLoyaltyService.delete(casinoId, programId);
  if (!ok) throw new AppError(404, 'Не найдено');
  res.json({ ok: true });
}

export async function aiLoyaltyFromImage(req: AuthRequestWithFile, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  if (!casinoId) throw new AppError(400, 'Некорректный ID казино');
  const file = req.file;
  if (!file) throw new AppError(400, 'Файл не загружен');
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new AppError(503, 'ИИ не настроен (OPENAI_API_KEY)');
  }

  const geoHint =
    (req.body?.geo as string | undefined) || (req.query?.geo as string | undefined) || undefined;

  const suggestions = await extractLoyaltyFromImage(file.path, file.mimetype, {
    geoHint: geoHint ?? null,
  });

  if (file.path && fs.existsSync(file.path)) {
    void fs.promises.unlink(file.path).catch(() => undefined);
  }

  if (!suggestions) {
    res.json({ suggestions: null });
    return;
  }
  res.json({ suggestions });
}

export async function formatMarkdown(req: AuthRequest, res: Response): Promise<void> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new AppError(503, 'ИИ не настроен (OPENAI_API_KEY)');
  }
  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  const out = await formatPlainTextToMarkdown(text);
  if (!out) {
    res.json({ markdown: null });
    return;
  }
  res.json({ markdown: out });
}

/** ИИ по скрину одного статуса (без сохранения файла на сервере). */
export async function aiLoyaltyStatusFromImage(req: AuthRequestWithFile, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  if (!casinoId) throw new AppError(400, 'Некорректный ID казино');
  const file = req.file;
  if (!file) throw new AppError(400, 'Файл не загружен');
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new AppError(503, 'ИИ не настроен (OPENAI_API_KEY)');
  }

  const statusName =
    (req.body?.status_name as string | undefined) ||
    (req.body?.statusName as string | undefined) ||
    undefined;

  const suggestions = await extractLoyaltyStatusFromImage(file.path, file.mimetype, {
    statusName: statusName ?? null,
  });

  if (file.path && fs.existsSync(file.path)) {
    void fs.promises.unlink(file.path).catch(() => undefined);
  }

  if (!suggestions) {
    res.json({ suggestions: null });
    return;
  }
  res.json({ suggestions });
}

export async function uploadLoyaltyStatusImages(req: Request, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const programId = Number(req.params.programId);
  const statusId = Number(req.params.statusId);
  if (!casinoId || !programId || !statusId) throw new AppError(400, 'Некорректные параметры');

  const st = await casinoLoyaltyService.assertStatusInProgram(casinoId, programId, statusId);
  if (!st) throw new AppError(404, 'Статус не найден');

  const files = multerFilesArray(req.files);
  if (!files?.length) throw new AppError(400, 'Файл не загружен');

  const uploaded: (casino_loyalty_status_images & { url: string })[] = [];
  for (const file of files) {
    const fileName = path.basename(file.path);
    const relativePath = path.join('loyalty-status-images', fileName).replace(/\\/g, '/');
    const img = await casinoLoyaltyService.addStatusImage(
      casinoId,
      statusId,
      relativePath,
      file.originalname,
    );
    uploaded.push({ ...img, url: `/api/uploads/${img.file_path}` });
  }
  res.status(201).json(uploaded);
}

export async function getLoyaltyStatusImages(req: AuthRequest, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const programId = Number(req.params.programId);
  const statusId = Number(req.params.statusId);
  if (!casinoId || !programId || !statusId) throw new AppError(400, 'Некорректные параметры');

  const st = await casinoLoyaltyService.assertStatusInProgram(casinoId, programId, statusId);
  if (!st) throw new AppError(404, 'Статус не найден');

  const images = await casinoLoyaltyService.getStatusImages(statusId);
  res.json(
    images.map((img) => ({
      ...img,
      url: `/api/uploads/${img.file_path}`,
    })),
  );
}

export async function deleteLoyaltyStatusImage(req: AuthRequest, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const imageId = Number(req.params.imageId);
  if (!casinoId || !imageId) throw new AppError(400, 'Некорректные параметры');

  const image = await casinoLoyaltyService.getStatusImageById(imageId);
  if (!image || image.casino_id !== casinoId) throw new AppError(404, 'Изображение не найдено');

  await casinoLoyaltyService.deleteStatusImage(imageId);
  const filePath = path.join(uploadsRoot, image.file_path);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ ok: true });
}
