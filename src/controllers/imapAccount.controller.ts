import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../database/connection';
import { ImapService } from '../services/imap.service';
import { encryptPassword, decryptPassword } from '../common/utils/crypto.utils';
import {
  isGmailOAuthConfigured,
  getGmailAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  buildXOAuth2Token,
} from '../services/gmail-oauth.service';
import type { ConnectionType } from '../models/ImapAccount';

// ---------------------------------------------------------------------------
// SQL helpers (keep password/oauth tokens out of default SELECT)
// ---------------------------------------------------------------------------

const SAFE_COLUMNS =
  'id, name, connection_type, host, port, user, tls, is_active, created_at, updated_at';

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export const listImapAccounts = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${SAFE_COLUMNS} FROM imap_accounts ORDER BY name`,
    );
    res.json(rows);
  } catch (error) {
    console.error('Error listing IMAP accounts:', error);
    res.status(500).json({ error: 'Failed to list IMAP accounts' });
  }
};

export const getImapAccountById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${SAFE_COLUMNS} FROM imap_accounts WHERE id = ?`,
      [id],
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(404).json({ error: 'IMAP account not found' });
      return;
    }
    res.json(rows[0]);
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
    const password_encrypted = encryptPassword(password);
    const [result] = await pool.query(
      `INSERT INTO imap_accounts (name, connection_type, host, port, user, password_encrypted, tls, is_active)
       VALUES (?, 'imap', ?, ?, ?, ?, ?, ?)`,
      [name, host, Number(port), user, password_encrypted, !!tls, !!is_active],
    );
    const insertId = (result as any).insertId;
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${SAFE_COLUMNS} FROM imap_accounts WHERE id = ?`,
      [insertId],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error creating IMAP account:', error);
    res.status(500).json({ error: 'Failed to create IMAP account' });
  }
};

export const updateImapAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, host, port, user, password, tls, is_active } = req.body;
    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (host !== undefined) { updates.push('host = ?'); values.push(host); }
    if (port !== undefined) { updates.push('port = ?'); values.push(Number(port)); }
    if (user !== undefined) { updates.push('user = ?'); values.push(user); }
    if (password !== undefined) {
      updates.push('password_encrypted = ?');
      values.push(encryptPassword(password));
    }
    if (tls !== undefined) { updates.push('tls = ?'); values.push(!!tls); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(!!is_active); }

    if (updates.length === 0) {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT ${SAFE_COLUMNS} FROM imap_accounts WHERE id = ?`,
        [id],
      );
      if (!Array.isArray(rows) || rows.length === 0) {
        res.status(404).json({ error: 'IMAP account not found' });
        return;
      }
      res.json(rows[0]);
      return;
    }

    values.push(id);
    await pool.query(
      `UPDATE imap_accounts SET ${updates.join(', ')} WHERE id = ?`,
      values,
    );

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${SAFE_COLUMNS} FROM imap_accounts WHERE id = ?`,
      [id],
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(404).json({ error: 'IMAP account not found' });
      return;
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating IMAP account:', error);
    res.status(500).json({ error: 'Failed to update IMAP account' });
  }
};

export const deleteImapAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM imap_accounts WHERE id = ?', [id]);
    if ((result as any).affectedRows === 0) {
      res.status(404).json({ error: 'IMAP account not found' });
      return;
    }
    res.json({ message: 'IMAP account deleted' });
  } catch (error) {
    console.error('Error deleting IMAP account:', error);
    res.status(500).json({ error: 'Failed to delete IMAP account' });
  }
};

// ---------------------------------------------------------------------------
// Test connection
// ---------------------------------------------------------------------------

export const testImapAccount = async (req: Request, res: Response): Promise<void> => {
  let imapService: ImapService | null = null;
  try {
    const { id } = req.params;
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name, connection_type, host, port, user, password_encrypted, oauth_refresh_token_encrypted, tls FROM imap_accounts WHERE id = ?',
      [id],
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(404).json({ error: 'IMAP account not found' });
      return;
    }

    const row = rows[0];
    const connectionType: ConnectionType = row.connection_type || 'imap';

    if (connectionType === 'gmail_oauth') {
      // Refresh access token and use XOAUTH2
      const refreshToken = decryptPassword(row.oauth_refresh_token_encrypted);
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
      try { imapService.disconnect(); } catch { /* ignore */ }
    }
  }
};

// ---------------------------------------------------------------------------
// Gmail OAuth endpoints
// ---------------------------------------------------------------------------

/** GET /imap-accounts/gmail/status – check if OAuth is available */
export const gmailOAuthStatus = async (_req: Request, res: Response): Promise<void> => {
  res.json({ configured: isGmailOAuthConfigured() });
};

/** GET /imap-accounts/gmail/auth-url – get Google consent URL */
export const gmailGetAuthUrl = async (_req: Request, res: Response): Promise<void> => {
  try {
    const url = getGmailAuthUrl();
    res.json({ url });
  } catch (error: any) {
    console.error('Error generating Gmail auth URL:', error);
    res.status(500).json({ error: error.message || 'Failed to generate auth URL' });
  }
};

/** POST /imap-accounts/gmail/callback – exchange code for tokens & create account */
export const gmailCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, name } = req.body;
    if (!code) {
      res.status(400).json({ error: 'Authorization code is required' });
      return;
    }

    const { email, refreshToken } = await exchangeCodeForTokens(code);

    const displayName = name || `Gmail: ${email}`;
    const oauthRefreshTokenEncrypted = encryptPassword(refreshToken);

    const [result] = await pool.query(
      `INSERT INTO imap_accounts
        (name, connection_type, host, port, user, password_encrypted, oauth_refresh_token_encrypted, tls, is_active)
       VALUES (?, 'gmail_oauth', 'imap.gmail.com', 993, ?, '', ?, TRUE, TRUE)`,
      [displayName, email, oauthRefreshTokenEncrypted],
    );

    const insertId = (result as any).insertId;
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${SAFE_COLUMNS} FROM imap_accounts WHERE id = ?`,
      [insertId],
    );

    res.status(201).json(rows[0]);
  } catch (error: any) {
    console.error('Gmail OAuth callback error:', error);
    res.status(500).json({ error: error.message || 'Failed to complete Gmail OAuth' });
  }
};
