import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { SlotScreenshotService } from '../../services/slot-screenshot.service';
import { slotScreenshotService } from './slotScreenshot.service';

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

export const takeScreenshot = async (req: AuthRequest, res: Response): Promise<void> => {
  const { selectorId } = req.params;
  let selector: any = null;

  try {
    const selectorNum = parseInt(selectorId, 10);
    if (isNaN(selectorNum)) {
      res.status(400).json({ error: 'Invalid selector id' });
      return;
    }

    const prismaSelector = await (await import('../../lib/prisma')).default.slot_selectors.findUnique(
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

    const screenshotRow = await prisma.slot_screenshots.create({
      data: {
        selector_id: selectorNum,
        screenshot_path: screenshotPath,
      },
    });

    const resultList = await slotScreenshotService.getScreenshotsBySelector(selectorNum);
    const created = resultList.find((s) => s.id === screenshotRow.id) ?? {
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

