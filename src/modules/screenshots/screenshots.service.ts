import prisma from '../../lib/prisma';
import path from 'path';

const serverRoot = path.resolve(__dirname, '..', '..', '..');
const uploadsDir = path.join(serverRoot, 'uploads');

function buildScreenshotUrl(absolutePath: string | null): {
  screenshot_path: string | null;
  screenshot_url: string | null;
} {
  if (!absolutePath) {
    return { screenshot_path: null, screenshot_url: null };
  }
  const relativePath = path.relative(uploadsDir, absolutePath).replace(/\\/g, '/');
  return {
    screenshot_path: absolutePath,
    screenshot_url: `/api/uploads/${relativePath}`,
  };
}

export const slotScreenshotService = {
  async getScreenshotsBySelector(selectorId: number) {
    const rows = await prisma.screenshots.findMany({
      where: { selector_id: selectorId },
      orderBy: { created_at: 'desc' },
    });

    return rows.map((row) => {
      const { screenshot_path, screenshot_url } = buildScreenshotUrl(row.screenshot_path);
      return {
        id: row.id,
        selector_id: row.selector_id,
        screenshot_path,
        screenshot_url,
        created_at: row.created_at,
      };
    });
  },

  async getScreenshotsByCasino(casinoId: number) {
    const selectors = await prisma.selectors.findMany({
      where: { casino_id: casinoId },
      include: {
        screenshots: {
          orderBy: { created_at: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ geo: 'asc' }, { category: 'asc' }],
    });

    return selectors.map((selector) => {
      const latest = selector.screenshots[0];
      const base = latest
        ? buildScreenshotUrl(latest.screenshot_path)
        : { screenshot_path: null, screenshot_url: null };

      const selectorValue = selector.selector === 'MANUAL' ? null : selector.selector;

      return {
        selector_id: selector.id,
        geo: selector.geo,
        section: selector.section,
        category: selector.category,
        url: selector.url,
        selector: selectorValue,
        screenshot_id: latest?.id ?? null,
        screenshot_path: base.screenshot_path,
        screenshot_url: base.screenshot_url,
        screenshot_created_at: latest?.created_at ?? null,
      };
    });
  },

  async getAllScreenshots(filters: {
    geo?: string;
    section?: string;
    category?: string;
    casinoId?: number;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const where: NonNullable<Parameters<typeof prisma.screenshots.findMany>[0]>['where'] = {};

    if (filters.dateFrom || filters.dateTo) {
      where.created_at = {};
      if (filters.dateFrom) {
        where.created_at.gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        where.created_at.lte = new Date(filters.dateTo);
      }
    }

    if (filters.geo || filters.section || filters.category || filters.casinoId) {
      where.selectors = where.selectors ?? {};
      if (filters.geo) {
        where.selectors.geo = filters.geo;
      }
      if (filters.section) {
        where.selectors.section = filters.section;
      }
      if (filters.category) {
        where.selectors.category = filters.category;
      }
      if (filters.casinoId) {
        where.selectors.casino_id = filters.casinoId;
      }
    }

    const rows = await prisma.screenshots.findMany({
      where,
      include: {
        selectors: {
          include: {
            casinos: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return rows.map((row) => {
      const base = buildScreenshotUrl(row.screenshot_path);
      const casino = row.selectors.casinos;
      const selectorValue =
        row.selectors.selector === 'MANUAL' ? null : row.selectors.selector;

      return {
        screenshot_id: row.id,
        screenshot_path: base.screenshot_path,
        screenshot_created_at: row.created_at,
        selector_id: row.selector_id,
        geo: row.selectors.geo,
        section: row.selectors.section,
        category: row.selectors.category,
        selector: selectorValue,
        url: row.selectors.url,
        casino_id: casino?.id ?? null,
        casino_name: casino?.name ?? null,
        screenshot_url: base.screenshot_url,
      };
    });
  },
};

