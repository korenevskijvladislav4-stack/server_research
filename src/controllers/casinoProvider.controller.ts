import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../database/connection';
import { extractProviderNamesFromText } from '../services/ai-summary.service';

export interface ProviderRow {
  id: number;
  name: string;
  created_at?: string;
}

export interface CasinoProviderRow {
  id: number;
  casino_id: number;
  provider_id: number;
  geo: string;
  created_at?: string;
  provider_name?: string;
}

// GET /casinos/:casinoId/providers?geo=RU
export const listCasinoProviders = async (req: Request, res: Response): Promise<void> => {
  try {
    const casinoId = Number(req.params.casinoId);
    const geo = req.query.geo as string | undefined;
    if (!casinoId) {
      res.status(400).json({ error: 'casinoId required' });
      return;
    }
    const connection = await pool.getConnection();
    try {
      let sql = `
        SELECT cp.id, cp.casino_id, cp.provider_id, cp.geo, cp.created_at, p.name AS provider_name
        FROM casino_providers cp
        JOIN providers p ON p.id = cp.provider_id
        WHERE cp.casino_id = ?
      `;
      const params: any[] = [casinoId];
      if (geo) {
        sql += ' AND cp.geo = ?';
        params.push(geo);
      }
      sql += ' ORDER BY p.name';
      const [rows] = await connection.query<RowDataPacket[]>(sql, params);
      res.json(rows as CasinoProviderRow[]);
    } finally {
      connection.release();
    }
  } catch (e: any) {
    console.error('listCasinoProviders error:', e?.message || e);
    res.status(500).json({ error: 'Failed to list casino providers' });
  }
};

// POST /casinos/:casinoId/providers — body: { provider_id?: number, provider_name?: string, geo: string }
export const addProviderToCasino = async (req: Request, res: Response): Promise<void> => {
  try {
    const casinoId = Number(req.params.casinoId);
    const { provider_id, provider_name, geo } = req.body;
    if (!casinoId || !geo || (typeof geo !== 'string') || !geo.trim()) {
      res.status(400).json({ error: 'casinoId and geo are required' });
      return;
    }
    const geoTrim = geo.trim();
    const connection = await pool.getConnection();
    try {
      let providerId: number | null = null;
      if (provider_id) {
        const [existing] = await connection.query<RowDataPacket[]>(
          'SELECT id FROM providers WHERE id = ?',
          [provider_id]
        );
        if (Array.isArray(existing) && existing.length > 0) {
          providerId = (existing[0] as any).id;
        }
      }
      if (providerId == null && provider_name && typeof provider_name === 'string' && provider_name.trim()) {
        const nameTrim = provider_name.trim();
        const [existing] = await connection.query<RowDataPacket[]>(
          'SELECT id FROM providers WHERE name = ?',
          [nameTrim]
        );
        if (Array.isArray(existing) && existing.length > 0) {
          providerId = (existing[0] as any).id;
        } else {
          const [ins] = await connection.query('INSERT INTO providers (name) VALUES (?)', [nameTrim]);
          providerId = (ins as any).insertId;
        }
      }
      if (providerId == null) {
        res.status(400).json({ error: 'Provide provider_id or provider_name' });
        return;
      }
      await connection.query(
        'INSERT IGNORE INTO casino_providers (casino_id, provider_id, geo) VALUES (?, ?, ?)',
        [casinoId, providerId, geoTrim]
      );
      const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT cp.id, cp.casino_id, cp.provider_id, cp.geo, cp.created_at, p.name AS provider_name FROM casino_providers cp JOIN providers p ON p.id = cp.provider_id WHERE cp.casino_id = ? AND cp.provider_id = ? AND cp.geo = ?',
        [casinoId, providerId, geoTrim]
      );
      const created = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      res.status(201).json(created);
    } finally {
      connection.release();
    }
  } catch (e: any) {
    console.error('addProviderToCasino error:', e?.message || e);
    res.status(500).json({ error: 'Failed to add provider to casino' });
  }
};

// DELETE /casinos/:casinoId/providers/:providerId?geo=RU
export const removeProviderFromCasino = async (req: Request, res: Response): Promise<void> => {
  try {
    const casinoId = Number(req.params.casinoId);
    const providerId = Number(req.params.providerId);
    const geo = req.query.geo as string | undefined;
    if (!casinoId || !providerId) {
      res.status(400).json({ error: 'casinoId and providerId required' });
      return;
    }
    const connection = await pool.getConnection();
    try {
      let sql = 'DELETE FROM casino_providers WHERE casino_id = ? AND provider_id = ?';
      const params: any[] = [casinoId, providerId];
      if (geo) {
        sql += ' AND geo = ?';
        params.push(geo);
      }
      await connection.query(sql, params);
      res.json({ ok: true });
    } finally {
      connection.release();
    }
  } catch (e: any) {
    console.error('removeProviderFromCasino error:', e?.message || e);
    res.status(500).json({ error: 'Failed to remove provider from casino' });
  }
};

// POST /casinos/:casinoId/providers/extract-ai — body: { text: string, geo: string }
export const extractAndAddProviders = async (req: Request, res: Response): Promise<void> => {
  try {
    const casinoId = Number(req.params.casinoId);
    const { text, geo } = req.body;
    if (!casinoId || !geo || (typeof geo !== 'string') || !geo.trim()) {
      res.status(400).json({ error: 'casinoId and geo are required' });
      return;
    }
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'text is required' });
      return;
    }
    const geoTrim = geo.trim();
    const connection = await pool.getConnection();
    let existingNames: string[] = [];
    try {
      const [providerRows] = await connection.query<RowDataPacket[]>(
        'SELECT name FROM providers ORDER BY name',
      );
      existingNames = (providerRows || []).map((r: any) => r.name);
    } finally {
      connection.release();
    }

    const names = await extractProviderNamesFromText(text, existingNames);
    if (names.length === 0) {
      res.json({ names: [], added: 0, message: 'No provider names extracted' });
      return;
    }

    const conn = await pool.getConnection();
    let added = 0;
    try {
      for (const name of names) {
        const nameTrim = name.trim();
        if (!nameTrim) continue;
        let providerId: number;
        const [existing] = await conn.query<RowDataPacket[]>(
          'SELECT id FROM providers WHERE name = ?',
          [nameTrim]
        );
        if (Array.isArray(existing) && existing.length > 0) {
          providerId = (existing[0] as any).id;
        } else {
          const [ins] = await conn.query('INSERT INTO providers (name) VALUES (?)', [nameTrim]);
          providerId = (ins as any).insertId;
        }
        const [insCp] = await conn.query(
          'INSERT IGNORE INTO casino_providers (casino_id, provider_id, geo) VALUES (?, ?, ?)',
          [casinoId, providerId, geoTrim]
        );
        if ((insCp as any).affectedRows > 0) added++;
      }
      res.json({ names, added });
    } finally {
      conn.release();
    }
  } catch (e: any) {
    console.error('extractAndAddProviders error:', e?.message || e);
    res.status(500).json({ error: 'Failed to extract and add providers' });
  }
};

// GET /providers/analytics?geo=&casino_id=&provider_id=
// Returns { casinos: [{ id, name }], providers: [{ id, name }], connections: [{ casino_id, provider_id }] }
export const getProviderAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const geo = req.query.geo as string | undefined;
    const casinoId = req.query.casino_id ? Number(req.query.casino_id) : undefined;
    const providerId = req.query.provider_id ? Number(req.query.provider_id) : undefined;

    const connection = await pool.getConnection();
    try {
      const casinoWhere: string[] = ['1=1'];
      const casinoParams: any[] = [];
      if (casinoId) {
        casinoWhere.push('c.id = ?');
        casinoParams.push(casinoId);
      }
      if (geo) {
        casinoWhere.push('JSON_CONTAINS(c.geo, CAST(? AS JSON), \'$\')');
        casinoParams.push(JSON.stringify(geo));
      }
      const [casinoRows] = await connection.query<RowDataPacket[]>(
        `SELECT c.id, c.name FROM casinos c WHERE ${casinoWhere.join(' AND ')} ORDER BY c.name`,
        casinoParams
      );
      const casinos = (casinoRows || []) as { id: number; name: string }[];

      const providerWhere: string[] = ['1=1'];
      const providerParams: any[] = [];
      if (providerId) {
        providerWhere.push('p.id = ?');
        providerParams.push(providerId);
      }
      const [providerRows] = await connection.query<RowDataPacket[]>(
        `SELECT p.id, p.name FROM providers p WHERE ${providerWhere.join(' AND ')} ORDER BY p.name`,
        providerParams
      );
      const providers = (providerRows || []) as { id: number; name: string }[];

      if (casinos.length === 0 || providers.length === 0) {
        res.json({ casinos, providers, connections: [] });
        return;
      }

      const casinoIds = casinos.map((c) => c.id);
      const providerIds = providers.map((p) => p.id);
      const placeholdersCasino = casinoIds.map(() => '?').join(',');
      const placeholdersProvider = providerIds.map(() => '?').join(',');
      let connSql = `
        SELECT cp.casino_id, cp.provider_id
        FROM casino_providers cp
        WHERE cp.casino_id IN (${placeholdersCasino}) AND cp.provider_id IN (${placeholdersProvider})
      `;
      const connParams: any[] = [...casinoIds, ...providerIds];
      if (geo) {
        connSql += ' AND cp.geo = ?';
        connParams.push(geo);
      }
      const [connRows] = await connection.query<RowDataPacket[]>(connSql, connParams);
      const connections = (connRows || []) as { casino_id: number; provider_id: number }[];

      res.json({ casinos, providers, connections });
    } finally {
      connection.release();
    }
  } catch (e: any) {
    console.error('getProviderAnalytics error:', e?.message || e);
    res.status(500).json({ error: 'Failed to fetch provider analytics' });
  }
};
