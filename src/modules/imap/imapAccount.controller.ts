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
import { imapAccountService } from './imapAccount.service';

const SAFE_ERROR = 'Failed to list IMAP accounts';

export const listImapAccounts = async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await imapAccountService.list();
    res.json(rows);
  } catch (error) {
    console.error('Error listing IMAP accounts:', error);
    res.status(500).json({ error: SAFE_ERROR });
  }
};

export const getImapAccountById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const row = await imapAccountService.getById(Number(id));
    if (!row) {
      res.status(404).json({ error: 'IMAP account not found' });
      return;
    }
    res.json(row);
  } catch (error) {
    console.error('Error getting IMAP account:', error);
    res.status(500).json({ error: 'Failed to get IMAP account' });
  }
};

export const createImapAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, host, port = 993, user, password, tls = true, is_active = true } = req.body;
    if (!name || !host || !user || !password) {
      res.status(400).json({ error: 'name, host, user and password are required' });
      return;
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
  } catch (error) {
    console.error('Error creating IMAP account:', error);
    res.status(500).json({ error: 'Failed to create IMAP account' });
  }
};

export const updateImapAccount = async (req: Request, res: Response): Promise<void> => {
  try {
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
      res.status(404).json({ error: 'IMAP account not found' });
      return;
    }
    res.json(row);
  } catch (error) {
    console.error('Error updating IMAP account:', error);
    res.status(500).json({ error: 'Failed to update IMAP account' });
  }
};

export const deleteImapAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const ok = await imapAccountService.deleteImapAccount(Number(id));
    if (!ok) {
      res.status(404).json({ error: 'IMAP account not found' });
      return;
    }
    res.json({ message: 'IMAP account deleted' });
  } catch (error) {
    console.error('Error deleting IMAP account:', error);
    res.status(500).json({ error: 'Failed to delete IMAP account' });
  }
};

export const testImapAccount = async (req: Request, res: Response): Promise<void> => {
  let imapService: ImapService | null = null;
  try {
    const { id } = req.params;
    const row = await imapAccountService.getFullById(Number(id));
    if (!row) {
      res.status(404).json({ error: 'IMAP account not found' });
      return;
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
  try {
    const url = getGmailAuthUrl();
    res.json({ url });
  } catch (error: any) {
    console.error('Error generating Gmail auth URL:', error);
    res.status(500).json({ error: error.message || 'Failed to generate auth URL' });
  }
};

export const gmailCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, name } = req.body;
    if (!code) {
      res.status(400).json({ error: 'Authorization code is required' });
      return;
    }

    const { email, refreshToken } = await exchangeCodeForTokens(code);

    const displayName = name || `Gmail: ${email}`;
    const row = await imapAccountService.createGmailOAuthAccount({
      displayName,
      email,
      refreshToken,
    });

    res.status(201).json(row);
  } catch (error: any) {
    console.error('Gmail OAuth callback error:', error);
    res.status(500).json({ error: error.message || 'Failed to complete Gmail OAuth' });
  }
};

