import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { ImapService } from '../../services/imap.service';
import { decryptPassword } from '../../common/utils/crypto.utils';
import {
  refreshAccessToken,
  buildXOAuth2Token,
} from '../../services/gmail-oauth.service';
import type { ConnectionType } from '../../models/ImapAccount';
import { summarizeEmailsByIds, assignEmailTopicsByIds } from '../../services/ai-summary.service';
import { screenshotEmailsByIds } from '../../services/email-screenshot.service';
import { emailService } from './email.service';
import prisma from '../../lib/prisma';

function sanitizeBigInt<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, val) => (typeof val === 'bigint' ? Number(val) : val)),
  );
}

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

async function buildImapServiceForAccount(row: {
  id: number;
  name: string;
  connection_type: ConnectionType;
  host: string;
  port: number;
  user: string;
  password_encrypted: string;
  oauth_refresh_token_encrypted: string | null;
  tls: boolean;
}): Promise<ImapService> {
  const connectionType: ConnectionType = row.connection_type || 'imap';

  if (connectionType === 'gmail_oauth') {
    const refreshToken = decryptPassword(row.oauth_refresh_token_encrypted!);
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

export const getEmailRecipients = async (_req: Request, res: Response): Promise<void> => {
  try {
    const recipients = await emailService.getEmailRecipients();
    res.json(recipients);
  } catch (error) {
    console.error('Error fetching email recipients:', error);
    res.status(500).json({ error: (error as any)?.message || 'Failed to fetch recipients' });
  }
};

export const getEmailAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { date_from, date_to, to_email, geo, topic_id } = req.query;
    const result = await emailService.getEmailAnalytics({
      date_from: date_from ? String(date_from) : undefined,
      date_to: date_to ? String(date_to) : undefined,
      to_email: to_email ? String(to_email) : undefined,
      geo: geo ? String(geo) : undefined,
      topic_id: topic_id ? Number(topic_id) : undefined,
    });
    res.json(result);
  } catch (error) {
    console.error('Error fetching email analytics:', error);
    res.status(500).json({ error: (error as any)?.message || 'Failed to fetch email analytics' });
  }
};

export const getAllEmails = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      limit = 50,
      offset = 0,
      is_read,
      related_casino_id,
      to_email,
      date_from,
      date_to,
      geo,
      topic_id,
    } = req.query;

    const lim = parseInt(limit as string, 10);
    const off = parseInt(offset as string, 10);

    if (related_casino_id) {
      const result = await emailService.getAllEmailsByCasinoNameMatch({
        casinoId: Number(related_casino_id),
        limit: lim,
        offset: off,
        is_read: is_read ? String(is_read) : undefined,
        to_email: to_email ? String(to_email) : undefined,
        date_from: date_from ? String(date_from) : undefined,
        date_to: date_to ? String(date_to) : undefined,
        geo: geo ? String(geo) : undefined,
      });
      if (result.notFound) {
        res.status(404).json({ error: 'Casino not found' });
        return;
      }
      res.json({
        data: result.data,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      });
      return;
    }

    const result = await emailService.getAllEmailsStandard({
      limit: lim,
      offset: off,
      is_read: is_read ? String(is_read) : undefined,
      to_email: to_email ? String(to_email) : undefined,
      date_from: date_from ? String(date_from) : undefined,
      date_to: date_to ? String(date_to) : undefined,
      geo: geo ? String(geo) : undefined,
      topic_id: topic_id ? Number(topic_id) : undefined,
    });

    res.json(sanitizeBigInt(result));
  } catch (error) {
    console.error('Error fetching emails:', error);
    res.status(500).json({ error: (error as any)?.message || 'Failed to fetch emails' });
  }
};

export const getEmailsByCasinoNameMatch = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { casinoId } = req.params;
    const { limit = 50, offset = 0, to_email } = req.query;

    const lim = parseInt(limit as string, 10);
    const off = parseInt(offset as string, 10);

    const result = await emailService.getEmailsByCasinoNameMatchSimple({
      casinoId: Number(casinoId),
      limit: lim,
      offset: off,
      to_email: to_email ? String(to_email) : undefined,
    });

    if (result.notFound) {
      res.status(404).json({ error: 'Casino not found' });
      return;
    }

    res.json(
      sanitizeBigInt({
        data: result.data,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      }),
    );
  } catch (error) {
    console.error('getEmailsByCasinoNameMatch error:', error);
    res.status(500).json({ error: (error as any)?.message || 'Failed to fetch emails for casino' });
  }
};

export const getEmailById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const row = await emailService.getEmailById(id);
    if (!row) {
      res.status(404).json({ error: 'Email not found' });
      return;
    }
    res.json(row);
  } catch (error) {
    console.error('Error fetching email:', error);
    res.status(500).json({ error: (error as any)?.message || 'Failed to fetch email' });
  }
};

export const syncEmails = async (req: Request, res: Response): Promise<void> => {
  const accountIdParam = req.query.accountId as string | undefined;
  const services: ImapService[] = [];

  try {
    const accounts = await prisma.imap_accounts.findMany({
      where: {
        is_active: true,
        ...(accountIdParam ? { id: Number(accountIdParam) } : {}),
      },
      orderBy: { name: 'asc' },
    });

    if (accounts.length === 0) {
      const envUser = process.env.IMAP_USER;
      const envPassword = process.env.IMAP_PASSWORD;
      if (envUser && envPassword) {
        const imapService = new ImapService();
        services.push(imapService);
        const { synced: syncedCount, newIds } = await imapService.syncEmailsToDatabase();
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

    for (const acc of accounts as any[]) {
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
          try {
            imapSvc.disconnect();
          } catch {
            // ignore
          }
        }
      }
    }

    let linkedCount = 0;
    try {
      const { linked } = await emailService.autoLinkEmailsToCasinos(false);
      linkedCount = linked;
    } catch (e) {
      console.error('Auto-link error (non-fatal):', e);
    }

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
      message:
        `Synced ${totalSynced} new emails from ${accounts.length} account(s)` +
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
      try {
        svc.disconnect();
      } catch {
        // ignore
      }
    }
  }
};

export const relinkEmails = async (req: Request, res: Response): Promise<void> => {
  try {
    const resetAll = req.query.reset === 'true';
    const { linked } = await emailService.autoLinkEmailsToCasinos(resetAll);
    res.json({
      message: resetAll
        ? `Перепривязано ${linked} писем к казино`
        : `Привязано ${linked} писем к казино`,
      linked,
      reset: resetAll,
    });
  } catch (error) {
    console.error('Error relinking emails:', error);
    res.status(500).json({ error: (error as any)?.message || 'Failed to relink emails' });
  }
};

export const markEmailAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updated = await emailService.markEmailAsRead(id);
    res.json(updated);
  } catch (error) {
    console.error('Error marking email as read:', error);
    res.status(500).json({ error: (error as any)?.message || 'Failed to mark email as read' });
  }
};

export const linkEmailToCasino = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { casino_id } = req.body;
    const updated = await emailService.linkEmailToCasino(id, Number(casino_id));
    res.json(updated);
  } catch (error) {
    console.error('Error linking email to casino:', error);
    res.status(500).json({ error: (error as any)?.message || 'Failed to link email to casino' });
  }
};

export const requestSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    await emailService.clearSummaryAndTopic(Number(id));

    const { summarizeEmail, assignEmailTopic } = await import(
      '../../services/ai-summary.service'
    );
    const summary = await summarizeEmail(Number(id));
    await assignEmailTopic(Number(id));

    if (!summary) {
      res.status(500).json({ error: 'Не удалось получить саммари' });
      return;
    }

    const row = await emailService.getEmailById(id);
    res.json(row);
  } catch (error) {
    console.error('Error requesting summary:', error);
    res.status(500).json({ error: (error as any)?.message || 'Failed to generate summary' });
  }
};

export const requestScreenshot = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    await emailService.clearScreenshot(Number(id));

    const { screenshotEmail } = await import('../../services/email-screenshot.service');
    const url = await screenshotEmail(Number(id));

    if (!url) {
      res.status(500).json({ error: 'Не удалось сделать скриншот' });
      return;
    }

    const row = await emailService.getEmailById(id);
    res.json(row);
  } catch (error) {
    console.error('Error requesting screenshot:', error);
    res.status(500).json({ error: (error as any)?.message || 'Failed to generate screenshot' });
  }
};

export const exportEmailsXlsx = async (req: Request, res: Response): Promise<void> => {
  try {
    const { related_casino_id, to_email, geo, date_from, date_to, is_read, topic_id } = req.query;

    const proto = req.protocol;
    const host = req.get('host') || 'localhost:5000';
    const baseUrl = `${proto}://${host}`;

    const emails = await emailService.exportEmails({
      related_casino_id: related_casino_id ? String(related_casino_id) : undefined,
      to_email: to_email ? String(to_email) : undefined,
      geo: geo ? String(geo) : undefined,
      date_from: date_from ? String(date_from) : undefined,
      date_to: date_to ? String(date_to) : undefined,
      is_read: is_read ? String(is_read) : undefined,
      topic_id: topic_id ? Number(topic_id) : undefined,
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Письма');

    sheet.columns = [
      { header: 'Проект', key: 'project', width: 25 },
      { header: 'GEO', key: 'geo', width: 8 },
      { header: 'Отправитель', key: 'sender', width: 35 },
      { header: 'Получатель', key: 'recipient', width: 30 },
      { header: 'Дата', key: 'date', width: 18 },
      { header: 'Тематика', key: 'topic', width: 25 },
      { header: 'Саммари', key: 'summary', width: 60 },
      { header: 'Скриншот', key: 'screenshot', width: 50 },
    ];

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
        topic: email.topic_name || '',
        summary: email.ai_summary || '',
        screenshot: screenshotLink,
      });
    }

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const cell = row.getCell('screenshot');
      const url = cell.value as string;
      if (url && url.startsWith('http')) {
        cell.value = { text: 'Открыть', hyperlink: url };
        cell.font = { color: { argb: 'FF0563C1' }, underline: true };
      }
    });

    const filename = `emails_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting emails:', error);
    res.status(500).json({ error: (error as any)?.message || 'Failed to export emails' });
  }
};

