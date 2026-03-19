import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { SlotScreenshotService } from '../../services/screenshot.service';
import { slotScreenshotService } from './screenshots.service';
import fs from 'fs';

const screenshotService = new SlotScreenshotService();

export const getScreenshotsBySelector = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { selectorId } = req.params;
    const selectorNum = parseInt(selectorId, 10);

    const screenshots = await slotScreenshotService.getScreenshotsBySelector(selectorNum);
    res.json(screenshots);
  } catch (error: any) {
    console.error('Error fetching screenshots:', error);
    res.status(500).json({
      error: 'Failed to fetch screenshots',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const deleteManualScreenshot = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const casinoId = Number(req.params.casinoId);
    const screenshotId = Number(req.params.screenshotId);

    if (!casinoId || Number.isNaN(casinoId) || !screenshotId || Number.isNaN(screenshotId)) {
      res.status(400).json({ error: 'Invalid params' });
      return;
    }

    const prisma = (await import('../../lib/prisma')).default;

    const screenshot = await prisma.screenshots.findUnique({
      where: { id: screenshotId },
      include: { selectors: true },
    });

    if (!screenshot) {
      res.status(404).json({ error: 'Screenshot not found' });
      return;
    }

    if (screenshot.selectors.casino_id !== casinoId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    if (screenshot.selectors.selector !== 'MANUAL') {
      res.status(400).json({ error: 'Only manual screenshots can be deleted' });
      return;
    }

    const selectorId = screenshot.selectors.id;

    // Clean all screenshot files for this MANUAL selector (best-effort).
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

    // Delete screenshots + selector. screenshots have Cascade on selectors.
    await prisma.selectors.delete({
      where: { id: selectorId },
    });

    res.status(204).send();
  } catch (error: any) {
    console.error('deleteManualScreenshot error:', error);
    res.status(500).json({
      error: 'Failed to delete screenshot',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const takeScreenshot = async (req: AuthRequest, res: Response): Promise<void> => {
  const { selectorId } = req.params;
  let selector: any = null;

  try {
    const selectorNum = parseInt(selectorId, 10);
    if (isNaN(selectorNum)) {
      res.status(400).json({ error: 'Invalid selector id' });
      return;
    }

    const prismaSelector = await (await import('../../lib/prisma')).default.selectors.findUnique(
      { where: { id: selectorNum } },
    );
    if (!prismaSelector) {
      res.status(404).json({ error: 'Selector not found' });
      return;
    }

    selector = prismaSelector;

    const prisma = (await import('../../lib/prisma')).default;
    const casino = await prisma.casinos.findUnique({
      where: { id: selector.casino_id },
      select: { website: true },
    });
    if (!casino || !casino.website) {
      res.status(404).json({ error: 'Casino website not found' });
      return;
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
    const created =
      resultList.find((s: any) => s.id === screenshotRow.id) ?? {
        id: screenshotRow.id,
        selector_id: screenshotRow.selector_id,
        screenshot_path: screenshotRow.screenshot_path,
        screenshot_url: null,
        created_at: screenshotRow.created_at,
      };

    res.status(201).json(created);
  } catch (error: any) {
    console.error('\n❌ ========== SCREENSHOT ERROR ==========');
    console.error('Error taking screenshot for selector ID:', selectorId);
    console.error('Error type:', error.name || 'Unknown');
    console.error('Error message:', error.message);
    console.error('Error code:', (error as any).code || 'N/A');
    console.error('Error stack:', error.stack);
    console.error('Selector info:', {
      id: selectorId,
      selector: selector?.selector,
      geo: selector?.geo,
      url: selector?.url,
      casino_id: selector?.casino_id,
    });
    console.error('==========================================\n');

    const errorResponse: any = {
      error: 'Failed to take screenshot',
    };

    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'production') {
      errorResponse.message = error.message;

      if (
        error.message.includes("Executable doesn't exist") ||
        error.message.includes('Could not find Chromium')
      ) {
        errorResponse.hint =
          'Chromium not found. Please install Chromium and set PUPPETEER_EXECUTABLE_PATH in .env';
        errorResponse.installCommand = 'sudo apt-get install -y chromium-browser';
      } else if (error.message.includes('timeout')) {
        errorResponse.hint =
          'Request timeout. Check proxy connection or target website availability';
      } else if (error.message.includes('net::ERR_')) {
        errorResponse.hint =
          'Network error. Check proxy settings and target website accessibility';
      } else if (
        error.message.includes('Target closed') ||
        error.message.includes('Session closed')
      ) {
        errorResponse.hint =
          'Browser closed unexpectedly. Check server memory (free -h) and add swap if needed';
      } else if (error.message.includes('No space left')) {
        errorResponse.hint = 'No disk space. Free up space on the server';
      }
    }

    res.status(500).json(errorResponse);
  }
};

export const getScreenshotsByCasino = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { casinoId } = req.params;
    const casinoIdNum = parseInt(casinoId, 10);

    if (isNaN(casinoIdNum)) {
      res.status(400).json({ error: 'Invalid casino ID' });
      return;
    }

    const result = await slotScreenshotService.getScreenshotsByCasino(casinoIdNum);
    res.json(result);
  } catch (error: any) {
    console.error('Error fetching screenshots:', error);
    res.status(500).json({
      error: 'Failed to fetch screenshots',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const getAllScreenshots = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { geo, section, category, casinoId, dateFrom, dateTo } = req.query;

    const casinoIdNum =
      typeof casinoId === 'string' && casinoId ? parseInt(casinoId, 10) : undefined;

    const result = await slotScreenshotService.getAllScreenshots({
      geo: geo ? String(geo) : undefined,
      section: section ? String(section) : undefined,
      category: category ? String(category) : undefined,
      casinoId: casinoIdNum && !isNaN(casinoIdNum) ? casinoIdNum : undefined,
      dateFrom: dateFrom ? String(dateFrom) : undefined,
      dateTo: dateTo ? String(dateTo) : undefined,
    });

    res.json(result);
  } catch (error: any) {
    console.error('Error fetching all screenshots:', error);
    res.status(500).json({
      error: 'Failed to fetch screenshots',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export async function uploadManualScreenshot(req: AuthRequest, res: Response): Promise<void> {
  try {
    const casinoId = Number(req.params.casinoId);
    if (!casinoId || Number.isNaN(casinoId)) {
      res.status(400).json({ error: 'Invalid casino ID' });
      return;
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    const geo = String(req.body?.geo || '').toUpperCase().trim();
    const section = String(req.body?.section || '').trim();
    const category =
      req.body?.category !== undefined && req.body.category !== null
        ? String(req.body.category).trim() || null
        : null;
    const url = req.body?.url ? String(req.body.url).trim() || null : null;

    if (!geo || !section) {
      res.status(400).json({ error: 'geo and section are required' });
      return;
    }

    const prisma = (await import('../../lib/prisma')).default;

    // find or create selector for this casino/geo/section/category
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
      // При ручной загрузке помечаем selector как MANUAL всегда
      selector = await prisma.selectors.update({
        where: { id: selector.id },
        data: {
          selector: 'MANUAL',
          url,
        },
      });
    }

    // Replace existing screenshots for this MANUAL selector
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

    // Save screenshot row into screenshots table
    const screenshotRow = await prisma.screenshots.create({
      data: {
        selector_id: selector.id,
        screenshot_path: file.path,
      },
    });

    const resultList = await slotScreenshotService.getScreenshotsByCasino(casinoId);
    const created =
      resultList.find((s: any) => s.screenshot_id === screenshotRow.id) ?? {
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
  } catch (error: any) {
    console.error('uploadManualScreenshot error:', error);
    res.status(500).json({
      error: 'Failed to upload screenshot',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

