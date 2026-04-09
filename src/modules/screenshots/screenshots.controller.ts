import { Response } from 'express';
import type { selectors } from '@prisma/client';
import { AuthRequest } from '../../middleware/auth.middleware';
import { AppError } from '../../errors/AppError';
import { SlotScreenshotService } from '../../services/screenshot.service';
import { slotScreenshotService } from './screenshots.service';
import fs from 'fs';

const screenshotService = new SlotScreenshotService();

type AuthRequestWithFile = AuthRequest & { file?: Express.Multer.File };

type SelectorScreenshotRow = Awaited<
  ReturnType<typeof slotScreenshotService.getScreenshotsBySelector>
>[number];

type CasinoScreenshotRow = Awaited<
  ReturnType<typeof slotScreenshotService.getScreenshotsByCasino>
>[number];

export const getScreenshotsBySelector = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { selectorId } = req.params;
  const selectorNum = parseInt(selectorId, 10);

  const screenshots = await slotScreenshotService.getScreenshotsBySelector(selectorNum);
  res.json(screenshots);
};

export const deleteManualScreenshot = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const casinoId = Number(req.params.casinoId);
  const screenshotId = Number(req.params.screenshotId);

  if (!casinoId || Number.isNaN(casinoId) || !screenshotId || Number.isNaN(screenshotId)) {
    throw new AppError(400, 'Некорректные параметры');
  }

  const prisma = (await import('../../lib/prisma')).default;

  const screenshot = await prisma.screenshots.findUnique({
    where: { id: screenshotId },
    include: { selectors: true },
  });

  if (!screenshot) {
    throw new AppError(404, 'Скриншот не найден');
  }

  if (screenshot.selectors.casino_id !== casinoId) {
    throw new AppError(403, 'Недостаточно прав');
  }

  if (screenshot.selectors.selector !== 'MANUAL') {
    throw new AppError(400, 'Можно удалять только загруженные вручную скриншоты');
  }

  const selectorId = screenshot.selectors.id;

  const screenshots = await prisma.screenshots.findMany({
    where: { selector_id: selectorId },
    select: { screenshot_path: true },
  });
  for (const s of screenshots) {
    if (!s.screenshot_path) continue;
    try {
      fs.unlinkSync(s.screenshot_path);
    } catch {
      // ignore
    }
  }

  await prisma.selectors.delete({
    where: { id: selectorId },
  });

  res.status(204).send();
};

export const takeScreenshot = async (req: AuthRequest, res: Response): Promise<void> => {
  const { selectorId } = req.params;
  const selectorNum = parseInt(selectorId, 10);
  if (isNaN(selectorNum)) {
    throw new AppError(400, 'Некорректный ID селектора');
  }

  const prisma = (await import('../../lib/prisma')).default;

  const prismaSelector = await prisma.selectors.findUnique(
    { where: { id: selectorNum } },
  );
  if (!prismaSelector) {
    throw new AppError(404, 'Селектор не найден');
  }

  const selector: selectors = prismaSelector;

  const casino = await prisma.casinos.findUnique({
    where: { id: selector.casino_id },
    select: { website: true },
  });
  if (!casino || !casino.website) {
    throw new AppError(404, 'Сайт казино не найден');
  }

  const casinoWebsite = casino.website;

  let urlToUse: string;
  if (selector.url) {
    if (selector.url.startsWith('/')) {
      try {
        const baseUrl = new URL(casinoWebsite);
        urlToUse = new URL(selector.url, baseUrl).href;
      } catch {
        urlToUse = casinoWebsite.replace(/\/$/, '') + selector.url;
      }
    } else {
      urlToUse = selector.url;
    }
  } else {
    urlToUse = casinoWebsite;
  }

  const serverRoot = require('path').resolve(__dirname, '..', '..', '..');
  const uploadsDir = require('path').join(serverRoot, 'uploads');
  const outputDir = require('path').join(uploadsDir, 'screenshots');

  const screenshotPath = await screenshotService.takeScreenshot(
    urlToUse,
    selector.selector,
    selector.geo,
    outputDir,
  );

  const screenshotRow = await prisma.screenshots.create({
    data: {
      selector_id: selectorNum,
      screenshot_path: screenshotPath,
    },
  });

  const resultList = await slotScreenshotService.getScreenshotsBySelector(selectorNum);
  const created: SelectorScreenshotRow =
    resultList.find((s) => s.id === screenshotRow.id) ?? {
      id: screenshotRow.id,
      selector_id: screenshotRow.selector_id,
      screenshot_path: screenshotRow.screenshot_path,
      screenshot_url: null,
      created_at: screenshotRow.created_at,
    };

  res.status(201).json(created);
};

export const getScreenshotsByCasino = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const { casinoId } = req.params;
  const casinoIdNum = parseInt(casinoId, 10);

  if (isNaN(casinoIdNum)) {
    throw new AppError(400, 'Некорректный ID казино');
  }

  const result = await slotScreenshotService.getScreenshotsByCasino(casinoIdNum);
  res.json(result);
};

export const getAllScreenshots = async (req: AuthRequest, res: Response): Promise<void> => {
  const { geo, section, category, casinoId, dateFrom, dateTo } = req.query;

  const casinoIdNum =
    typeof casinoId === 'string' && casinoId ? parseInt(casinoId, 10) : undefined;

  const geoArr = Array.isArray(geo) ? geo.map(String).filter(Boolean) : (geo ? [String(geo)] : []);
  const result = await slotScreenshotService.getAllScreenshots({
    geo: geoArr.length > 0 ? geoArr : undefined,
    section: section ? String(section) : undefined,
    category: category ? String(category) : undefined,
    casinoId: casinoIdNum && !isNaN(casinoIdNum) ? casinoIdNum : undefined,
    dateFrom: dateFrom ? String(dateFrom) : undefined,
    dateTo: dateTo ? String(dateTo) : undefined,
  });

  res.json(result);
};

export async function uploadManualScreenshot(req: AuthRequestWithFile, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  if (!casinoId || Number.isNaN(casinoId)) {
    throw new AppError(400, 'Некорректный ID казино');
  }

  const file = req.file;
  if (!file) {
    throw new AppError(400, 'Файл не загружен');
  }

  const geo = String(req.body?.geo || '').toUpperCase().trim();
  const section = String(req.body?.section || '').trim();
  const category =
    req.body?.category !== undefined && req.body.category !== null
      ? String(req.body.category).trim() || null
      : null;
  const url = req.body?.url ? String(req.body.url).trim() || null : null;

  if (!geo || !section) {
    throw new AppError(400, 'GEO и раздел обязательны');
  }

  const prisma = (await import('../../lib/prisma')).default;

  let selector = await prisma.selectors.findFirst({
    where: {
      casino_id: casinoId,
      geo,
      section,
      category,
    },
  });

  if (!selector) {
    selector = await prisma.selectors.create({
      data: {
        casino_id: casinoId,
        geo,
        section,
        category,
        selector: 'MANUAL',
        url,
      },
    });
  } else {
    selector = await prisma.selectors.update({
      where: { id: selector.id },
      data: {
        selector: 'MANUAL',
        url,
      },
    });
  }

  const existing = await prisma.screenshots.findMany({
    where: { selector_id: selector.id },
    orderBy: { created_at: 'desc' },
  });

  for (const s of existing) {
    try {
      if (s.screenshot_path) fs.unlinkSync(s.screenshot_path);
    } catch {
      // ignore
    }
  }

  await prisma.screenshots.deleteMany({ where: { selector_id: selector.id } });

  const screenshotRow = await prisma.screenshots.create({
    data: {
      selector_id: selector.id,
      screenshot_path: file.path,
    },
  });

  const resultList = await slotScreenshotService.getScreenshotsByCasino(casinoId);
  const created: CasinoScreenshotRow =
    resultList.find((s) => s.screenshot_id === screenshotRow.id) ?? {
      selector_id: selector.id,
      geo: selector.geo,
      section: selector.section,
      category: selector.category,
      url: selector.url,
      selector: selector.selector === 'MANUAL' ? null : selector.selector,
      screenshot_id: screenshotRow.id,
      screenshot_path: screenshotRow.screenshot_path,
      screenshot_url: null,
      screenshot_created_at: screenshotRow.created_at,
    };

  res.status(201).json(created);
}
