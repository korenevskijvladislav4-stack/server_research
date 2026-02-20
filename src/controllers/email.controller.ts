import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import ExcelJS from 'exceljs';
import pool from '../database/connection';
import { ImapService } from '../services/imap.service';
import { decryptPassword } from '../common/utils/crypto.utils';
import {
  refreshAccessToken,
  buildXOAuth2Token,
} from '../services/gmail-oauth.service';
import { Email } from '../models/Email';
import type { ConnectionType } from '../models/ImapAccount';
import { summarizeEmailsByIds, assignEmailTopicsByIds } from '../services/ai-summary.service';
import { screenshotEmailsByIds } from '../services/email-screenshot.service';

// ---------------------------------------------------------------------------
// Name-matching helpers
// ---------------------------------------------------------------------------

const normalizeName = (value?: string | null): string => {
  if (!value) return '';
  let s = value.normalize('NFKD');
  s = s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
  s = s.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase().trim();
  return s;
};

const extractDomainName = (email?: string | null): string => {
  if (!email) return '';
  const match = email.match(/@([^.]+)/);
  return match?.[1] ? normalizeName(match[1]) : '';
};

const emailMatchesCasino = (email: Email, casinoNorm: string): boolean => {
  if (!casinoNorm || casinoNorm.length === 0) return false;

  const fromNameNorm = normalizeName(email.from_name);
  const fromEmailNorm = normalizeName(email.from_email);
  const domainName = extractDomainName(email.from_email);

  if (
    fromNameNorm === casinoNorm ||
    fromEmailNorm === casinoNorm ||
    domainName === casinoNorm
  )
    return true;

  if (fromNameNorm.length >= 4 && casinoNorm.length >= 4) {
    if (casinoNorm.includes(fromNameNorm) || fromNameNorm.includes(casinoNorm))
      return true;
  }

  if (domainName.length >= 4 && casinoNorm.length >= 4) {
    if (casinoNorm.includes(domainName) || domainName.includes(casinoNorm))
      return true;
  }

  return false;
};

// ---------------------------------------------------------------------------
// Auto-link: match unlinked emails to casinos by normalized name
// ---------------------------------------------------------------------------

export const autoLinkEmailsToCasinos = async (): Promise<number> => {
  const [casinoRows] = await pool.query<RowDataPacket[]>(
    'SELECT id, name FROM casinos',
  );
  const casinos = (casinoRows as { id: number; name: string }[]).map((c) => ({
    id: c.id,
    norm: normalizeName(c.name),
  })).filter((c) => c.norm.length > 0);

  if (casinos.length === 0) return 0;

  const [emailRows] = await pool.query<RowDataPacket[]>(
    'SELECT id, from_name, from_email FROM emails WHERE related_casino_id IS NULL',
  );

  if (!Array.isArray(emailRows) || emailRows.length === 0) return 0;

  let linked = 0;

  for (const email of emailRows as unknown as Email[]) {
    for (const casino of casinos) {
      if (emailMatchesCasino(email, casino.norm)) {
        await pool.query(
          'UPDATE emails SET related_casino_id = ? WHERE id = ?',
          [casino.id, email.id],
        );
        linked++;
        break; // first match wins
      }
    }
  }

  if (linked > 0) {
    console.log(`Auto-linked ${linked} emails to casinos`);
  }
  return linked;
};

// ---------------------------------------------------------------------------
// Helper: build ImapService from an account row (IMAP or OAuth)
// ---------------------------------------------------------------------------

async function buildImapServiceForAccount(row: RowDataPacket): Promise<ImapService> {
  const connectionType: ConnectionType = row.connection_type || 'imap';

  if (connectionType === 'gmail_oauth') {
    const refreshToken = decryptPassword(row.oauth_refresh_token_encrypted);
    const accessToken = await refreshAccessToken(refreshToken);
    const xoauth2 = buildXOAuth2Token(row.user, accessToken);

    return new ImapService({
      host: row.host,
      port: row.port,
      user: row.user,
      xoauth2,
      tls: true,
    });
  }

  const password = decryptPassword(row.password_encrypted);
  return new ImapService({
    host: row.host,
    port: row.port,
    user: row.user,
    password,
    tls: !!row.tls,
  });
}

// ---------------------------------------------------------------------------
// Reusable: SELECT emails with geo & casino_name via proper JOINs
// ---------------------------------------------------------------------------

const EMAIL_BASE_SELECT = `
  e.*, ca.geo AS geo, c.name AS casino_name, et.name AS topic_name
`;

const EMAIL_BASE_FROM = `
  FROM emails e
  LEFT JOIN casinos c ON c.id = e.related_casino_id
  LEFT JOIN casino_accounts ca ON ca.email = e.to_email AND ca.casino_id = e.related_casino_id
  LEFT JOIN email_topics et ON et.id = e.topic_id
`;

// ---------------------------------------------------------------------------
// Endpoints: recipients
// ---------------------------------------------------------------------------

export const getEmailRecipients = async (_req: Request, res: Response): Promise<void> => {
  try {
    // Return only emails that exist in casino_accounts
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT DISTINCT ca.email, ca.geo
       FROM casino_accounts ca
       WHERE ca.email IS NOT NULL AND TRIM(ca.email) != ''
       ORDER BY ca.email`,
    );
    // Return array of { email, geo } for richer filtering
    res.json(
      (rows as { email: string; geo: string }[]).map((r) => ({
        email: r.email,
        geo: r.geo,
      })),
    );
  } catch (error) {
    console.error('Error fetching email recipients:', error);
    res.status(500).json({ error: 'Failed to fetch recipients' });
  }
};

// ---------------------------------------------------------------------------
// Analytics: email counts grouped by casino + date
// ---------------------------------------------------------------------------

export const getEmailAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { date_from, date_to, to_email, geo } = req.query;

    // Default: last 30 days
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 29);

    const from = date_from ? String(date_from) : defaultFrom.toISOString().slice(0, 10);
    const to = date_to ? String(date_to) : now.toISOString().slice(0, 10);

    let whereExtra = '';
    let joinExtra = '';
    const params: any[] = [from, to];

    if (to_email && typeof to_email === 'string') {
      whereExtra += ' AND e.to_email = ?';
      params.push(to_email);
    }

    if (geo && typeof geo === 'string') {
      joinExtra = ' LEFT JOIN casino_accounts ca ON ca.email = e.to_email AND ca.casino_id = e.related_casino_id';
      whereExtra += ' AND ca.geo = ?';
      params.push(geo);
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
         e.related_casino_id AS casino_id,
         c.name              AS casino_name,
         DATE_FORMAT(e.date_received, '%Y-%m-%d') AS dt,
         CAST(COUNT(*) AS UNSIGNED) AS cnt
       FROM emails e
       LEFT JOIN casinos c ON c.id = e.related_casino_id
       ${joinExtra}
       WHERE e.related_casino_id IS NOT NULL
         AND e.date_received IS NOT NULL
         AND DATE(e.date_received) >= ?
         AND DATE(e.date_received) <= ?
         ${whereExtra}
       GROUP BY e.related_casino_id, c.name, DATE_FORMAT(e.date_received, '%Y-%m-%d')
       ORDER BY c.name, dt`,
      params,
    );

    // Normalize types: cnt to number, dt to string
    const data = (rows as any[]).map((r) => ({
      casino_id: r.casino_id,
      casino_name: r.casino_name || '',
      dt: String(r.dt),
      cnt: Number(r.cnt),
    }));

    res.json({ data, date_from: from, date_to: to });
  } catch (error) {
    console.error('Error fetching email analytics:', error);
    res.status(500).json({ error: 'Failed to fetch email analytics' });
  }
};

// ---------------------------------------------------------------------------
// Endpoints: list / detail
// ---------------------------------------------------------------------------

export const getAllEmails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = 50, offset = 0, is_read, related_casino_id, to_email, date_from, date_to, geo } = req.query;
    const connection = await pool.getConnection();

    // Casino name-matching branch
    if (related_casino_id) {
      try {
        const [casinoRows] = await connection.query<RowDataPacket[]>(
          'SELECT name FROM casinos WHERE id = ?',
          [related_casino_id],
        );
        if (!Array.isArray(casinoRows) || casinoRows.length === 0) {
          connection.release();
          res.status(404).json({ error: 'Casino not found' });
          return;
        }
        const casinoNorm = normalizeName((casinoRows[0] as any).name);

        // Use the FILTERED casino_id for GEO lookup, not e.related_casino_id
        const [emailRows] = await connection.query<RowDataPacket[]>(
          `SELECT e.*, ca.geo AS geo, c.name AS casino_name
           FROM emails e
           LEFT JOIN casinos c ON c.id = e.related_casino_id
           LEFT JOIN casino_accounts ca ON ca.email = e.to_email AND ca.casino_id = ?
           ORDER BY e.date_received DESC LIMIT 10000`,
          [related_casino_id],
        );
        connection.release();

        let matched = (emailRows as unknown as (Email & { geo?: string; casino_name?: string })[]).filter((e) =>
          emailMatchesCasino(e, casinoNorm),
        );
        if (is_read !== undefined)
          matched = matched.filter((e) => e.is_read === (is_read === 'true'));
        if (to_email && typeof to_email === 'string')
          matched = matched.filter((e) => e.to_email === to_email);
        if (geo && typeof geo === 'string')
          matched = matched.filter((e) => e.geo === geo);
        if (date_from && typeof date_from === 'string')
          matched = matched.filter((e) => {
            if (!e.date_received) return false;
            const d = new Date(e.date_received).toISOString().slice(0, 10);
            return d >= date_from;
          });
        if (date_to && typeof date_to === 'string')
          matched = matched.filter((e) => {
            if (!e.date_received) return false;
            const d = new Date(e.date_received).toISOString().slice(0, 10);
            return d <= date_to;
          });

        const lim = parseInt(limit as string);
        const off = parseInt(offset as string);
        res.json({
          data: matched.slice(off, off + lim),
          total: matched.length,
          limit: lim,
          offset: off,
        });
        return;
      } catch (err) {
        connection.release();
        console.error('Casino name matching error:', err);
        res.status(500).json({ error: 'Failed to fetch emails for casino' });
        return;
      }
    }

    // Standard SQL filtering — always JOIN casino_accounts + casinos for geo & casino_name
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    const countParams: any[] = [];

    if (is_read !== undefined) {
      whereClause += ' AND e.is_read = ?';
      params.push(is_read === 'true');
      countParams.push(is_read === 'true');
    }
    if (to_email && typeof to_email === 'string') {
      whereClause += ' AND e.to_email = ?';
      params.push(to_email);
      countParams.push(to_email);
    }
    if (date_from && typeof date_from === 'string') {
      whereClause += ' AND DATE(e.date_received) >= ?';
      params.push(date_from);
      countParams.push(date_from);
    }
    if (date_to && typeof date_to === 'string') {
      whereClause += ' AND DATE(e.date_received) <= ?';
      params.push(date_to);
      countParams.push(date_to);
    }
    if (geo && typeof geo === 'string') {
      whereClause += ' AND ca.geo = ?';
      params.push(geo);
      countParams.push(geo);
    }

    const [countResult] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total ${EMAIL_BASE_FROM} ${whereClause}`,
      countParams,
    );
    const total = (countResult[0] as any).total;

    const query = `SELECT ${EMAIL_BASE_SELECT} ${EMAIL_BASE_FROM} ${whereClause} ORDER BY e.date_received DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit as string), parseInt(offset as string));
    const [rows] = await connection.query<RowDataPacket[]>(query, params);
    connection.release();

    res.json({
      data: rows,
      total,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error) {
    console.error('Error fetching emails:', error);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
};

export const getEmailsByCasinoNameMatch = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { casinoId } = req.params;
    const { limit = 50, offset = 0, to_email } = req.query;

    const conn = await pool.getConnection();
    try {
      const [casinoRows] = await conn.query<RowDataPacket[]>(
        'SELECT name FROM casinos WHERE id = ?',
        [casinoId],
      );
      if (!Array.isArray(casinoRows) || casinoRows.length === 0) {
        conn.release();
        res.status(404).json({ error: 'Casino not found' });
        return;
      }
      const casinoNorm = normalizeName((casinoRows[0] as any).name);

      const [emailRows] = await conn.query<RowDataPacket[]>(
        `SELECT ${EMAIL_BASE_SELECT} ${EMAIL_BASE_FROM} ORDER BY e.date_received DESC LIMIT 10000`,
      );
      conn.release();

      let matched = (emailRows as unknown as (Email & { geo?: string; casino_name?: string })[]).filter((e) =>
        emailMatchesCasino(e, casinoNorm),
      );
      if (to_email && typeof to_email === 'string')
        matched = matched.filter((e) => e.to_email === to_email);

      const lim = parseInt(limit as string);
      const off = parseInt(offset as string);
      res.json({
        data: matched.slice(off, off + lim),
        total: matched.length,
        limit: lim,
        offset: off,
      });
    } catch (err) {
      conn.release();
      throw err;
    }
  } catch (error) {
    console.error('getEmailsByCasinoNameMatch error:', error);
    res.status(500).json({ error: 'Failed to fetch emails for casino' });
  }
};

export const getEmailById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${EMAIL_BASE_SELECT} ${EMAIL_BASE_FROM} WHERE e.id = ?`,
      [id],
    );
    if (Array.isArray(rows) && rows.length === 0) {
      res.status(404).json({ error: 'Email not found' });
      return;
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching email:', error);
    res.status(500).json({ error: 'Failed to fetch email' });
  }
};

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

const formatSyncError = (error: any): string => {
  const msg = error?.message ?? '';
  if (msg.includes('Application-specific password') || msg.includes('185833')) {
    return 'Для Gmail нужен пароль приложения, а не обычный пароль. Включите 2FA и создайте пароль приложения: https://support.google.com/accounts/answer/185833';
  }
  if (msg.includes('timeout') || error?.source === 'timeout-auth') {
    return 'IMAP authentication timeout. Check host, port, credentials and firewall.';
  }
  if (error?.code === 'ECONNREFUSED') {
    return 'Cannot connect to IMAP server. Check host, port and network.';
  }
  if (error?.code === 'EAUTH' || msg.includes('authentication')) {
    return 'IMAP authentication failed. Check credentials and IMAP access.';
  }
  return msg || 'Sync failed';
};

export const syncEmails = async (req: Request, res: Response): Promise<void> => {
  const accountIdParam = req.query.accountId as string | undefined;
  const services: ImapService[] = [];

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, name, connection_type, host, port, user, password_encrypted, oauth_refresh_token_encrypted, tls
       FROM imap_accounts
       WHERE is_active = 1 ${accountIdParam ? 'AND id = ?' : ''}
       ORDER BY name`,
      accountIdParam ? [accountIdParam] : [],
    );

    const accounts = Array.isArray(rows) ? rows : [];

    if (accounts.length === 0) {
      // Fallback to env-based config
      const envUser = process.env.IMAP_USER;
      const envPassword = process.env.IMAP_PASSWORD;
      if (envUser && envPassword) {
        const imapService = new ImapService();
        services.push(imapService);
        const { synced: syncedCount, newIds } = await imapService.syncEmailsToDatabase();
        // AI-summarize, assign topic, and screenshot only new emails (fire & forget)
        if (newIds.length > 0) {
          summarizeEmailsByIds(newIds).catch((e) =>
            console.error('AI summary error (non-fatal):', e),
          );
          assignEmailTopicsByIds(newIds).catch((e) =>
            console.error('AI topic assignment error (non-fatal):', e),
          );
          screenshotEmailsByIds(newIds).catch((e) =>
            console.error('Screenshot error (non-fatal):', e),
          );
        }
        res.json({
          message: `Synced ${syncedCount} new emails (env)`,
          totalSynced: syncedCount,
          results: [],
        });
        return;
      }
      res.status(400).json({
        error: 'Нет настроенных аккаунтов. Добавьте аккаунт в «Почта → Настройки».',
      });
      return;
    }

    const results: {
      accountId: number;
      name: string;
      synced: number;
      error?: string;
    }[] = [];
    let totalSynced = 0;
    const allNewIds: number[] = [];

    for (const acc of accounts) {
      let imapSvc: ImapService | null = null;
      try {
        imapSvc = await buildImapServiceForAccount(acc);
        services.push(imapSvc);
        const { synced, newIds } = await imapSvc.syncEmailsToDatabase();
        totalSynced += synced;
        allNewIds.push(...newIds);
        results.push({ accountId: acc.id, name: acc.name, synced });
      } catch (err: any) {
        results.push({
          accountId: acc.id,
          name: acc.name,
          synced: 0,
          error: formatSyncError(err),
        });
      } finally {
        if (imapSvc) {
          try { imapSvc.disconnect(); } catch { /* ignore */ }
        }
      }
    }

    // Auto-link new emails to casinos
    let linkedCount = 0;
    try {
      linkedCount = await autoLinkEmailsToCasinos();
    } catch (e) {
      console.error('Auto-link error (non-fatal):', e);
    }

    // AI-summarize, assign topic, and screenshot only newly synced emails (fire & forget)
    if (allNewIds.length > 0) {
      summarizeEmailsByIds(allNewIds).catch((e) =>
        console.error('AI summary error (non-fatal):', e),
      );
      assignEmailTopicsByIds(allNewIds).catch((e) =>
        console.error('AI topic assignment error (non-fatal):', e),
      );
      screenshotEmailsByIds(allNewIds).catch((e) =>
        console.error('Screenshot error (non-fatal):', e),
      );
    }

    res.json({
      message: `Synced ${totalSynced} new emails from ${accounts.length} account(s)` +
        (linkedCount > 0 ? `, auto-linked ${linkedCount}` : ''),
      totalSynced,
      linkedCount,
      results,
    });
  } catch (error: any) {
    console.error('Error syncing emails:', error);
    res.status(500).json({ error: formatSyncError(error) });
  } finally {
    for (const svc of services) {
      try { svc.disconnect(); } catch { /* ignore */ }
    }
  }
};

// ---------------------------------------------------------------------------
// Re-link: manually trigger auto-linking for all unlinked emails
// ---------------------------------------------------------------------------

export const relinkEmails = async (req: Request, res: Response): Promise<void> => {
  try {
    const resetAll = req.query.reset === 'true';
    if (resetAll) {
      await pool.query('UPDATE emails SET related_casino_id = NULL');
      console.log('Reset all related_casino_id to NULL');
    }
    const linked = await autoLinkEmailsToCasinos();
    res.json({
      message: resetAll
        ? `Перепривязано ${linked} писем к казино`
        : `Привязано ${linked} писем к казино`,
      linked,
      reset: resetAll,
    });
  } catch (error) {
    console.error('Error relinking emails:', error);
    res.status(500).json({ error: 'Failed to relink emails' });
  }
};

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const markEmailAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE emails SET is_read = TRUE WHERE id = ?', [id]);
    const [updated] = await pool.query<RowDataPacket[]>(
      `SELECT ${EMAIL_BASE_SELECT} ${EMAIL_BASE_FROM} WHERE e.id = ?`,
      [id],
    );
    res.json(updated[0]);
  } catch (error) {
    console.error('Error marking email as read:', error);
    res.status(500).json({ error: 'Failed to mark email as read' });
  }
};

export const linkEmailToCasino = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { casino_id } = req.body;
    await pool.query('UPDATE emails SET related_casino_id = ? WHERE id = ?', [
      casino_id,
      id,
    ]);
    const [updated] = await pool.query<RowDataPacket[]>(
      `SELECT ${EMAIL_BASE_SELECT} ${EMAIL_BASE_FROM} WHERE e.id = ?`,
      [id],
    );
    res.json(updated[0]);
  } catch (error) {
    console.error('Error linking email to casino:', error);
    res.status(500).json({ error: 'Failed to link email to casino' });
  }
};

// ---------------------------------------------------------------------------
// Manual: request AI summary for a single email
// ---------------------------------------------------------------------------

export const requestSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Clear existing summary and topic so they get regenerated
    await pool.query('UPDATE emails SET ai_summary = NULL, topic_id = NULL WHERE id = ?', [id]);

    const { summarizeEmail, assignEmailTopic } = await import('../services/ai-summary.service');
    const summary = await summarizeEmail(Number(id));
    await assignEmailTopic(Number(id));

    if (!summary) {
      res.status(500).json({ error: 'Не удалось получить саммари' });
      return;
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${EMAIL_BASE_SELECT} ${EMAIL_BASE_FROM} WHERE e.id = ?`,
      [id],
    );
    res.json(rows[0]);
  } catch (error) {
    console.error('Error requesting summary:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
};

// ---------------------------------------------------------------------------
// Manual: take screenshot for a single email
// ---------------------------------------------------------------------------

export const requestScreenshot = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Clear existing screenshot so it gets regenerated
    await pool.query('UPDATE emails SET screenshot_url = NULL WHERE id = ?', [id]);

    const { screenshotEmail } = await import('../services/email-screenshot.service');
    const url = await screenshotEmail(Number(id));

    if (!url) {
      res.status(500).json({ error: 'Не удалось сделать скриншот' });
      return;
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${EMAIL_BASE_SELECT} ${EMAIL_BASE_FROM} WHERE e.id = ?`,
      [id],
    );
    res.json(rows[0]);
  } catch (error) {
    console.error('Error requesting screenshot:', error);
    res.status(500).json({ error: 'Failed to generate screenshot' });
  }
};

// ---------------------------------------------------------------------------
// Export emails as XLSX
// ---------------------------------------------------------------------------

export const exportEmailsXlsx = async (req: Request, res: Response): Promise<void> => {
  try {
    const { related_casino_id, to_email, geo, date_from, date_to, is_read } = req.query;

    // Build base URL for screenshot links
    const proto = req.protocol;
    const host = req.get('host') || 'localhost:5000';
    const baseUrl = `${proto}://${host}`;

    // Build query — use base JOINs for geo & casino_name per project
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    if (related_casino_id) {
      whereClause += ' AND e.related_casino_id = ?';
      params.push(related_casino_id);
    }
    if (to_email && typeof to_email === 'string') {
      whereClause += ' AND e.to_email = ?';
      params.push(to_email);
    }
    if (date_from && typeof date_from === 'string') {
      whereClause += ' AND DATE(e.date_received) >= ?';
      params.push(date_from);
    }
    if (date_to && typeof date_to === 'string') {
      whereClause += ' AND DATE(e.date_received) <= ?';
      params.push(date_to);
    }
    if (is_read !== undefined) {
      whereClause += ' AND e.is_read = ?';
      params.push(is_read === 'true');
    }
    if (geo && typeof geo === 'string') {
      whereClause += ' AND ca.geo = ?';
      params.push(geo);
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
         e.id,
         e.from_email,
         e.from_name,
         e.to_email,
         e.subject,
         e.date_received,
         e.ai_summary,
         e.screenshot_url,
         e.related_casino_id,
         c.name AS casino_name,
         ca.geo AS geo
       ${EMAIL_BASE_FROM}
       ${whereClause}
       ORDER BY e.date_received DESC
       LIMIT 10000`,
      params,
    );

    const emails = rows as any[];

    // Build workbook
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Письма');

    sheet.columns = [
      { header: 'Проект', key: 'project', width: 25 },
      { header: 'GEO', key: 'geo', width: 8 },
      { header: 'Отправитель', key: 'sender', width: 35 },
      { header: 'Получатель', key: 'recipient', width: 30 },
      { header: 'Дата', key: 'date', width: 18 },
      { header: 'Саммари', key: 'summary', width: 60 },
      { header: 'Скриншот', key: 'screenshot', width: 50 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

    for (const email of emails) {
      const senderDisplay = email.from_name
        ? `${email.from_name} <${email.from_email}>`
        : email.from_email || '';

      const screenshotLink = email.screenshot_url
        ? `${baseUrl}${email.screenshot_url}`
        : '';

      const dateStr = email.date_received
        ? new Date(email.date_received).toISOString().slice(0, 16).replace('T', ' ')
        : '';

      sheet.addRow({
        project: email.casino_name || '',
        geo: email.geo || '',
        sender: senderDisplay,
        recipient: email.to_email || '',
        date: dateStr,
        summary: email.ai_summary || '',
        screenshot: screenshotLink,
      });
    }

    // Make screenshot column a hyperlink
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const cell = row.getCell('screenshot');
      const url = cell.value as string;
      if (url && url.startsWith('http')) {
        cell.value = { text: 'Открыть', hyperlink: url };
        cell.font = { color: { argb: 'FF0563C1' }, underline: true };
      }
    });

    // Send file
    const filename = `emails_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting emails:', error);
    res.status(500).json({ error: 'Failed to export emails' });
  }
};

