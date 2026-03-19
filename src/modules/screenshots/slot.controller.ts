import { Response } from 'express';
import { Slot } from '../../models/Slot';
import { SlotParserProxyService } from '../../services/slot-parser-proxy.service';
import { getProxyConfig } from '../../config/proxy.config';
import { AuthRequest } from '../../middleware/auth.middleware';
import { slotService } from './slot.service';
import prisma from '../../lib/prisma';

const parserService = new SlotParserProxyService();
const proxyConfig = getProxyConfig();
parserService.setGeoProxies(proxyConfig);

export const getSlotsByCasino = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { casinoId } = req.params;
    const { geo: geoFilter } = req.query;

    const casinoIdNum = parseInt(casinoId, 10);
    if (isNaN(casinoIdNum)) {
      res.status(400).json({ error: 'Invalid casino ID' });
      return;
    }

    const slots = await slotService.getSlotsByCasino(
      casinoIdNum,
      geoFilter ? String(geoFilter) : undefined,
    );

    res.json(slots);
  } catch (error: any) {
    console.error('Error fetching slots:', error);
    res.status(500).json({
      error: 'Failed to fetch slots',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const parseSlotsFromCasino = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { casinoId } = req.params;
    const { url, geos } = req.body as { url?: string; geos?: string[] };

    if (!url) {
      res.status(400).json({ error: 'URL is required' });
      return;
    }

    if (!geos || !Array.isArray(geos) || geos.length === 0) {
      res.status(400).json({ error: 'GEOs array is required' });
      return;
    }

    try {
      new URL(url);
    } catch {
      res.status(400).json({ error: 'Invalid URL format' });
      return;
    }

    const casino = await prisma.casinos.findUnique({
      where: { id: Number(casinoId) },
      select: { id: true, website: true },
    });
    if (!casino) {
      res.status(404).json({ error: 'Casino not found' });
      return;
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
  } catch (error: any) {
    console.error('Error parsing slots:', error);
    res.status(500).json({
      error: 'Failed to parse slots',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const deleteSlot = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const numId = parseInt(id, 10);
    if (isNaN(numId)) {
      res.status(400).json({ error: 'Invalid slot id' });
      return;
    }

    await slotService.deleteSlot(numId);
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting slot:', error);
    res.status(500).json({ error: 'Failed to delete slot' });
  }
};

