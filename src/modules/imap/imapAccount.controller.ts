import { Request, Response } from 'express';
import { ImapService } from '../../services/imap.service';
import { decryptPassword } from '../../common/utils/crypto.utils';
import {
  isGmailOAuthConfigured,
  getGmailAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  buildXOAuth2Token,
} from '../../services/gmail-oauth.service';
import type { ConnectionType } from '../../models/ImapAccount';
import { AppError } from '../../errors/AppError';
import { imapAccountService } from './imapAccount.service';

export const listImapAccounts = async (_req: Request, res: Response): Promise<void> => {
  const rows = await imapAccountService.list();
  res.json(rows);
};

export const getImapAccountById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const row = await imapAccountService.getById(Number(id));
  if (!row) {
    throw new AppError(404, 'IMAP-аккаунт не найден');
  }
  res.json(row);
};

export const createImapAccount = async (req: Request, res: Response): Promise<void> => {
  const { name, host, port = 993, user, password, tls = true, is_active = true } = req.body;
  if (!name || !host || !user || !password) {
    throw new AppError(400, 'Имя, хост, пользователь и пароль обязательны');
  }
  const row = await imapAccountService.createImapAccount({
    name,
    host,
    port: Number(port),
    user,
    password,
    tls,
    is_active,
  });
  res.status(201).json(row);
};

export const updateImapAccount = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { name, host, port, user, password, tls, is_active } = req.body;

  const row = await imapAccountService.updateImapAccount(Number(id), {
    name,
    host,
    port: port != null ? Number(port) : undefined,
    user,
    password,
    tls,
    is_active,
  });
  if (!row) {
    throw new AppError(404, 'IMAP-аккаунт не найден');
  }
  res.json(row);
};

export const deleteImapAccount = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const ok = await imapAccountService.deleteImapAccount(Number(id));
  if (!ok) {
    throw new AppError(404, 'IMAP-аккаунт не найден');
  }
  res.json({ message: 'IMAP account deleted' });
};

export const testImapAccount = async (req: Request, res: Response): Promise<void> => {
  let imapService: ImapService | null = null;
  try {
    const { id } = req.params;
    const row = await imapAccountService.getFullById(Number(id));
    if (!row) {
      throw new AppError(404, 'IMAP-аккаунт не найден');
    }

    const connectionType: ConnectionType = (row.connection_type as ConnectionType) || 'imap';

    if (connectionType === 'gmail_oauth') {
      const refreshToken = decryptPassword(row.oauth_refresh_token_encrypted!);
      const accessToken = await refreshAccessToken(refreshToken);
      const xoauth2 = buildXOAuth2Token(row.user, accessToken);

      imapService = new ImapService({
        host: row.host,
        port: row.port,
        user: row.user,
        xoauth2,
        tls: true,
      });
    } else {
      const password = decryptPassword(row.password_encrypted);
      imapService = new ImapService({
        host: row.host,
        port: row.port,
        user: row.user,
        password,
        tls: !!row.tls,
      });
    }

    await imapService.connect();
    imapService.disconnect();
    res.json({ success: true, message: 'Connection successful' });
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    const msg = error?.message ?? '';
    let errorText = msg || 'Connection failed';
    if (msg.includes('Application-specific password') || msg.includes('185833')) {
      errorText =
        'Для Gmail нужен пароль приложения. Создайте его в Google-аккаунте: https://support.google.com/accounts/answer/185833';
    }
    res.status(400).json({ success: false, error: errorText });
  } finally {
    if (imapService) {
      try {
        imapService.disconnect();
      } catch {
        // ignore
      }
    }
  }
};

export const gmailOAuthStatus = async (_req: Request, res: Response): Promise<void> => {
  res.json({ configured: isGmailOAuthConfigured() });
};

export const gmailGetAuthUrl = async (_req: Request, res: Response): Promise<void> => {
  const url = getGmailAuthUrl();
  res.json({ url });
};

export const gmailCallback = async (req: Request, res: Response): Promise<void> => {
  const { code, name } = req.body;
  if (!code) {
    throw new AppError(400, 'Код авторизации обязателен');
  }

  const { email, refreshToken } = await exchangeCodeForTokens(code);

  const displayName = name || `Gmail: ${email}`;
  const row = await imapAccountService.createGmailOAuthAccount({
    displayName,
    email,
    refreshToken,
  });

  res.status(201).json(row);
};
