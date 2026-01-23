import { Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../database/connection';
import { SlotScreenshotService } from '../services/slot-screenshot.service';
import { AuthRequest } from '../middleware/auth.middleware';
import path from 'path';

const screenshotService = new SlotScreenshotService();

// Server root path (works in both dev and production)
const SERVER_ROOT = path.resolve(__dirname, '..', '..');
const UPLOADS_DIR = path.join(SERVER_ROOT, 'uploads');

/**
 * Get screenshots for a selector
 */
export const getScreenshotsBySelector = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { selectorId } = req.params;
    const connection = await pool.getConnection();
    
    const [rows] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM slot_screenshots WHERE selector_id = ? ORDER BY created_at DESC',
      [selectorId]
    );
    connection.release();

    const screenshots = (rows as any[]).map((row) => {
      if (!row.screenshot_path) {
        return { ...row, screenshot_url: null };
      }
      // Get relative path for URL
      const relativePath = path.relative(UPLOADS_DIR, row.screenshot_path).replace(/\\/g, '/');
      return {
        ...row,
        screenshot_url: `/api/uploads/${relativePath}`,
      };
    });

    res.json(screenshots);
  } catch (error: any) {
    console.error('Error fetching screenshots:', error);
    res.status(500).json({ 
      error: 'Failed to fetch screenshots',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Take screenshot for a selector
 */
export const takeScreenshot = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { selectorId } = req.params;
    const connection = await pool.getConnection();

    // Get selector info
    const [selectors] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM slot_selectors WHERE id = ?',
      [selectorId]
    );

    if (!Array.isArray(selectors) || selectors.length === 0) {
      connection.release();
      res.status(404).json({ error: 'Selector not found' });
      return;
    }

    const selector = selectors[0];

    // Get casino website (required for building full URL)
    const [casinos] = await connection.query<RowDataPacket[]>(
      'SELECT website FROM casinos WHERE id = ?',
      [selector.casino_id]
    );

    if (!Array.isArray(casinos) || casinos.length === 0 || !casinos[0].website) {
      connection.release();
      res.status(404).json({ error: 'Casino website not found' });
      return;
    }

    const casinoWebsite = casinos[0].website;
    connection.release();

    // Build full URL: if selector.url is provided, it's a relative path (e.g., /bonuses, /slots)
    // Otherwise use casino website as-is
    let urlToUse: string;
    if (selector.url) {
      // If it starts with /, it's a relative path - combine with casino website
      if (selector.url.startsWith('/')) {
        try {
          const baseUrl = new URL(casinoWebsite);
          urlToUse = new URL(selector.url, baseUrl).href;
        } catch {
          // If URL parsing fails, just concatenate
          urlToUse = casinoWebsite.replace(/\/$/, '') + selector.url;
        }
      } else {
        // If it doesn't start with /, treat as full URL
        urlToUse = selector.url;
      }
    } else {
      // No URL specified, use casino website
      urlToUse = casinoWebsite;
    }

    // Take screenshot
    const outputDir = path.join(UPLOADS_DIR, 'screenshots');
    console.log('Output directory for screenshots:', outputDir);
    console.log('__dirname:', __dirname);
    console.log('Server root:', SERVER_ROOT);
    const screenshotPath = await screenshotService.takeScreenshot(
      urlToUse,
      selector.selector,
      selector.geo,
      outputDir
    );

    // Save screenshot info to database
    const connection2 = await pool.getConnection();
    const [result] = await connection2.query(
      'INSERT INTO slot_screenshots (selector_id, screenshot_path) VALUES (?, ?)',
      [selectorId, screenshotPath]
    );
    const insertId = (result as any).insertId;

    const [newScreenshot] = await connection2.query<RowDataPacket[]>(
      'SELECT * FROM slot_screenshots WHERE id = ?',
      [insertId]
    );
    connection2.release();

    // Get relative path for URL (from uploads directory)
    // screenshotPath is like: /path/to/server/uploads/screenshots/filename.png
    // We need: screenshots/filename.png
    const relativePath = path.relative(UPLOADS_DIR, screenshotPath).replace(/\\/g, '/');
    
    console.log('Screenshot path:', screenshotPath);
    console.log('Uploads base path:', UPLOADS_DIR);
    console.log('Relative path:', relativePath);
    console.log('Final URL:', `/api/uploads/${relativePath}`);
    
    const screenshot = {
      ...newScreenshot[0],
      screenshot_url: `/api/uploads/${relativePath}`,
    };

    res.status(201).json(screenshot);
  } catch (error: any) {
    console.error('Error taking screenshot:', error);
    res.status(500).json({ 
      error: 'Failed to take screenshot',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get all screenshots for a casino (grouped by selector)
 */
export const getScreenshotsByCasino = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { casinoId } = req.params;
    const casinoIdNum = parseInt(casinoId, 10);
    
    if (isNaN(casinoIdNum)) {
      res.status(400).json({ error: 'Invalid casino ID' });
      return;
    }

    const connection = await pool.getConnection();
    
    // Get selectors with their latest screenshots
    const [rows] = await connection.query<RowDataPacket[]>(`
      SELECT 
        ss.id as selector_id,
        ss.geo,
        ss.section,
        ss.category,
        ss.selector,
        ss.url,
        sc.id as screenshot_id,
        sc.screenshot_path,
        sc.created_at as screenshot_created_at
      FROM slot_selectors ss
      LEFT JOIN slot_screenshots sc ON ss.id = sc.selector_id
      WHERE ss.casino_id = ?
      ORDER BY ss.geo ASC, ss.category ASC, sc.created_at DESC
    `, [casinoIdNum]);
    
    connection.release();

    // Group by selector and get latest screenshot
    const grouped: any = {};
    for (const row of rows as any[]) {
      const key = `${row.selector_id}`;
      if (!grouped[key] || !row.screenshot_id || 
          (grouped[key].screenshot_created_at && 
           new Date(row.screenshot_created_at) > new Date(grouped[key].screenshot_created_at))) {
        grouped[key] = {
          selector_id: row.selector_id,
          geo: row.geo,
          section: row.section,
          category: row.category,
          url: row.url,
          screenshot_id: row.screenshot_id,
          screenshot_path: row.screenshot_path,
          screenshot_url: row.screenshot_path ? (() => {
            const relativePath = path.relative(UPLOADS_DIR, row.screenshot_path).replace(/\\/g, '/');
            return `/api/uploads/${relativePath}`;
          })() : null,
          screenshot_created_at: row.screenshot_created_at,
        };
      }
    }

    res.json(Object.values(grouped));
  } catch (error: any) {
    console.error('Error fetching screenshots:', error);
    res.status(500).json({ 
      error: 'Failed to fetch screenshots',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get all screenshots with filters (for gallery page)
 */
export const getAllScreenshots = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { geo, section, category, casinoId, dateFrom, dateTo } = req.query;
    
    const connection = await pool.getConnection();
    
    // Build query with filters
    let query = `
      SELECT 
        sc.id as screenshot_id,
        sc.screenshot_path,
        sc.created_at as screenshot_created_at,
        ss.id as selector_id,
        ss.geo,
        ss.section,
        ss.category,
        ss.selector,
        ss.url,
        c.id as casino_id,
        c.name as casino_name
      FROM slot_screenshots sc
      INNER JOIN slot_selectors ss ON sc.selector_id = ss.id
      INNER JOIN casinos c ON ss.casino_id = c.id
      WHERE 1=1
    `;
    
    const params: any[] = [];
    
    if (geo) {
      query += ` AND ss.geo = ?`;
      params.push(geo);
    }
    
    if (section) {
      query += ` AND ss.section = ?`;
      params.push(section);
    }
    
    if (category) {
      query += ` AND ss.category = ?`;
      params.push(category);
    }
    
    if (casinoId) {
      const casinoIdNum = parseInt(casinoId as string, 10);
      if (!isNaN(casinoIdNum)) {
        query += ` AND c.id = ?`;
        params.push(casinoIdNum);
      }
    }
    
    if (dateFrom) {
      query += ` AND sc.created_at >= ?`;
      params.push(dateFrom);
    }
    
    if (dateTo) {
      query += ` AND sc.created_at <= ?`;
      params.push(dateTo);
    }
    
    query += ` ORDER BY sc.created_at DESC`;
    
    const [rows] = await connection.query<RowDataPacket[]>(query, params);
    connection.release();

    const screenshots = (rows as any[]).map((row) => {
      if (!row.screenshot_path) {
        return { ...row, screenshot_url: null };
      }
      // Get relative path for URL
      const relativePath = path.relative(UPLOADS_DIR, row.screenshot_path).replace(/\\/g, '/');
      return {
        ...row,
        screenshot_url: `/api/uploads/${relativePath}`,
      };
    });

    res.json(screenshots);
  } catch (error: any) {
    console.error('Error fetching all screenshots:', error);
    res.status(500).json({ 
      error: 'Failed to fetch screenshots',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
