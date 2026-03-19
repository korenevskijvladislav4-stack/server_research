import { Response } from 'express';
import { Slot } from '../../models/Slot';
import { SlotParserProxyService } from '../../services/slot-parser-proxy.service';
import { getProxyConfig } from '../../config/proxy.config';
import { AuthRequest } from '../../middleware/auth.middleware';
import { AppError } from '../../errors/AppError';
import { slotService } from './slot.service';
import prisma from '../../lib/prisma';

const parserService = new SlotParserProxyService();
const proxyConfig = getProxyConfig();
parserService.setGeoProxies(proxyConfig);

export const getSlotsByCasino = async (req: AuthRequest, res: Response): Promise<void> => {
  const { casinoId } = req.params;
  const { geo: geoFilter } = req.query;

  const casinoIdNum = parseInt(casinoId, 10);
  if (isNaN(casinoIdNum)) {
    throw new AppError(400, 'Некорректный ID казино');
  }

  const slots = await slotService.getSlotsByCasino(
    casinoIdNum,
    geoFilter ? String(geoFilter) : undefined,
  );

  res.json(slots);
};

export const parseSlotsFromCasino = async (req: AuthRequest, res: Response): Promise<void> => {
  const { casinoId } = req.params;
  const { url, geos } = req.body as { url?: string; geos?: string[] };

  if (!url) {
    throw new AppError(400, 'URL обязателен');
  }

  if (!geos || !Array.isArray(geos) || geos.length === 0) {
    throw new AppError(400, 'Массив GEO обязателен');
  }

  try {
    new URL(url);
  } catch {
    throw new AppError(400, 'Некорректный формат URL');
  }

  const casino = await prisma.casinos.findUnique({
    where: { id: Number(casinoId) },
    select: { id: true, website: true },
  });
  if (!casino) {
    throw new AppError(404, 'Казино не найдено');
  }

  console.log(
    `Parsing slots from ${url} for casino ${casinoId}, GEOs: ${geos.map((g) => g.toUpperCase()).join(', ')}`,
  );

  const parsedResults = await parserService.parseSlotsForMultipleGeos(
    url,
    Number(casinoId),
    geos.map((g: string) => g.toUpperCase()),
  );

  const typedResults = parsedResults.map(({ geo, slots }) => ({
    geo,
    slots: slots as unknown as Slot[],
  }));

  const { savedCount, summary } = await slotService.upsertParsedSlots(
    Number(casinoId),
    typedResults,
  );

  res.json({
    message: `Successfully parsed and saved ${savedCount} slots`,
    summary,
    total: savedCount,
  });
};

export const deleteSlot = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    throw new AppError(400, 'Некорректный ID слота');
  }

  await slotService.deleteSlot(numId);
  res.status(204).send();
};
