import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../database/connection';
import { ImapService } from '../services/imap.service';
import { Email } from '../models/Email';

// Helper to normalize names for matching (remove emojis/special chars, lowercase)
const normalizeName = (value?: string | null): string => {
  if (!value) return '';
  let s = value.normalize('NFKD');
  // Remove common emoji ranges
  s = s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
  // Keep only letters and numbers, collapse separators
  s = s.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase().trim();
  return s;
};

// Helper to extract domain from email (e.g., "info@casinoname.com" -> "casinoname")
const extractDomainName = (email?: string | null): string => {
  if (!email) return '';
  const match = email.match(/@([^.]+)/);
  if (match && match[1]) {
    return normalizeName(match[1]);
  }
  return '';
};

// Check if email matches casino name (check both from_name and from_email domain)
const emailMatchesCasino = (email: Email, casinoNorm: string): boolean => {
  if (!casinoNorm || casinoNorm.length === 0) return false;
  
  const fromNameNorm = normalizeName(email.from_name);
  const fromEmailNorm = normalizeName(email.from_email);
  const domainName = extractDomainName(email.from_email);
  
  // Exact matches (most reliable)
  if (fromNameNorm === casinoNorm || 
      fromEmailNorm === casinoNorm || 
      domainName === casinoNorm) {
    return true;
  }
  
  // Partial matches - only if both strings are meaningful (at least 4 chars)
  // and one contains the other
  if (fromNameNorm.length >= 4 && casinoNorm.length >= 4) {
    if (casinoNorm.includes(fromNameNorm) || fromNameNorm.includes(casinoNorm)) {
      return true;
    }
  }
  
  // Check if domain name partially matches
  if (domainName.length >= 4 && casinoNorm.length >= 4) {
    if (casinoNorm.includes(domainName) || domainName.includes(casinoNorm)) {
      return true;
    }
  }
  
  return false;
};

export const getAllEmails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = 50, offset = 0, is_read, related_casino_id } = req.query;
    const connection = await pool.getConnection();
    
    // If filtering by casino, use name matching with normalization (same as getEmailsByCasinoNameMatch)
    if (related_casino_id) {
      try {
        // Get casino name
        const [casinoRows] = await connection.query<RowDataPacket[]>(
          'SELECT name FROM casinos WHERE id = ?',
          [related_casino_id]
        );
        if (!Array.isArray(casinoRows) || casinoRows.length === 0) {
          connection.release();
          res.status(404).json({ error: 'Casino not found' });
          return;
        }
        const casinoName = (casinoRows[0] as any).name as string;
        const casinoNorm = normalizeName(casinoName);

        // Fetch emails - increase limit significantly or fetch all for better matching
        const [emailRows] = await connection.query<RowDataPacket[]>(
          'SELECT * FROM emails ORDER BY date_received DESC LIMIT 10000'
        );
        connection.release();

        const allEmails = emailRows as unknown as Email[];
        // Filter using improved matching (check from_name, from_email, and domain)
        let matched = allEmails.filter((e) => emailMatchesCasino(e, casinoNorm));
        
        // Apply is_read filter if specified
        if (is_read !== undefined) {
          const isReadBool = is_read === 'true';
          matched = matched.filter((e) => e.is_read === isReadBool);
        }

        const limitNum = parseInt(limit as string);
        const offsetNum = parseInt(offset as string);
        const pageData = matched.slice(offsetNum, offsetNum + limitNum);

        res.json({
          data: pageData,
          total: matched.length,
          limit: limitNum,
          offset: offsetNum,
        });
        return;
      } catch (err) {
        connection.release();
        console.error('Error in casino name matching:', err);
        res.status(500).json({ error: 'Failed to fetch emails for casino' });
        return;
      }
    }

    // Standard SQL filtering when no casino filter
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    const countParams: any[] = [];

    if (is_read !== undefined) {
      whereClause += ' AND is_read = ?';
      params.push(is_read === 'true');
      countParams.push(is_read === 'true');
    }

    // Get total count
    const [countResult] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM emails ${whereClause}`,
      countParams
    );
    const total = (countResult[0] as any).total;

    // Get paginated results
    const query = `SELECT * FROM emails ${whereClause} ORDER BY date_received DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const [rows] = await connection.query<RowDataPacket[]>(query, params);
    connection.release();
    
    res.json({
      data: rows as unknown as Email[],
      total,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error) {
    console.error('Error fetching emails:', error);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
};

export const getEmailsByCasinoNameMatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const { casinoId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const conn = await pool.getConnection();
    try {
      // Get casino name
      const [casinoRows] = await conn.query<RowDataPacket[]>(
        'SELECT name FROM casinos WHERE id = ?',
        [casinoId]
      );
      if (!Array.isArray(casinoRows) || casinoRows.length === 0) {
        conn.release();
        res.status(404).json({ error: 'Casino not found' });
        return;
      }
      const casinoName = (casinoRows[0] as any).name as string;
      const casinoNorm = normalizeName(casinoName);

      // Fetch emails - increase limit significantly or fetch all for better matching
      const [emailRows] = await conn.query<RowDataPacket[]>(
        'SELECT * FROM emails ORDER BY date_received DESC LIMIT 10000'
      );
      conn.release();

      const allEmails = emailRows as unknown as Email[];
      // Filter using improved matching (check from_name, from_email, and domain)
      const matched = allEmails.filter((e) => emailMatchesCasino(e, casinoNorm));

      const limitNum = parseInt(limit as string);
      const offsetNum = parseInt(offset as string);
      const pageData = matched.slice(offsetNum, offsetNum + limitNum);

      res.json({
        data: pageData,
        total: matched.length,
        limit: limitNum,
        offset: offsetNum,
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
    const connection = await pool.getConnection();
    const [rows] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM emails WHERE id = ?',
      [id]
    );
    connection.release();

    if (Array.isArray(rows) && rows.length === 0) {
      res.status(404).json({ error: 'Email not found' });
      return;
    }

    res.json((rows as unknown as Email[])[0]);
  } catch (error) {
    console.error('Error fetching email:', error);
    res.status(500).json({ error: 'Failed to fetch email' });
  }
};

export const syncEmails = async (_req: Request, res: Response): Promise<void> => {
  let imapService: ImapService | null = null;
  
  try {
    imapService = new ImapService();
    const syncedCount = await imapService.syncEmailsToDatabase();
    res.json({ message: `Synced ${syncedCount} new emails` });
  } catch (error: any) {
    console.error('Error syncing emails:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Failed to sync emails';
    
    if (error?.message?.includes('timeout') || error?.source === 'timeout-auth') {
      errorMessage = 'IMAP authentication timeout. Please check:\n' +
        '1. IMAP_HOST and IMAP_PORT are correct\n' +
        '2. IMAP_USER and IMAP_PASSWORD are correct\n' +
        '3. For Mail.ru: use password for external applications if 2FA is enabled\n' +
        '4. For Gmail: use an App Password instead of regular password\n' +
        '5. Check firewall/network settings\n' +
        '6. Verify IMAP access is enabled in your email account settings';
    } else if (error?.code === 'ECONNREFUSED') {
      errorMessage = 'Cannot connect to IMAP server. Please check:\n' +
        '1. IMAP_HOST and IMAP_PORT are correct\n' +
        '2. Server is accessible from your network\n' +
        '3. Firewall is not blocking the connection';
    } else if (error?.code === 'EAUTH' || error?.message?.includes('authentication')) {
      errorMessage = 'IMAP authentication failed. Please check:\n' +
        '1. IMAP_USER and IMAP_PASSWORD are correct\n' +
        '2. For Mail.ru: ensure you are using password for external applications (if 2FA enabled)\n' +
        '3. For Gmail: ensure you are using an App Password (not your regular password)\n' +
        '4. Check that IMAP is enabled in your email account settings\n' +
        '5. Verify your account credentials are correct';
    } else if (error?.message) {
      errorMessage = `Failed to sync emails: ${error.message}`;
    }
    
    res.status(500).json({ error: errorMessage });
  } finally {
    // Ensure IMAP connection is closed
    if (imapService) {
      try {
        imapService.disconnect();
      } catch (disconnectError) {
        console.error('Error disconnecting IMAP:', disconnectError);
      }
    }
  }
};

export const markEmailAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();
    
    await connection.query(
      'UPDATE emails SET is_read = TRUE WHERE id = ?',
      [id]
    );

    const [updated] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM emails WHERE id = ?',
      [id]
    );

    connection.release();
    res.json((updated as unknown as Email[])[0]);
  } catch (error) {
    console.error('Error marking email as read:', error);
    res.status(500).json({ error: 'Failed to mark email as read' });
  }
};

export const linkEmailToCasino = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { casino_id } = req.body;
    const connection = await pool.getConnection();
    
    await connection.query(
      'UPDATE emails SET related_casino_id = ? WHERE id = ?',
      [casino_id, id]
    );

    const [updated] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM emails WHERE id = ?',
      [id]
    );

    connection.release();
    res.json((updated as unknown as Email[])[0]);
  } catch (error) {
    console.error('Error linking email to casino:', error);
    res.status(500).json({ error: 'Failed to link email to casino' });
  }
};

export const linkEmailToPromo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { promo_id } = req.body;
    const connection = await pool.getConnection();
    
    await connection.query(
      'UPDATE emails SET related_promo_id = ? WHERE id = ?',
      [promo_id, id]
    );

    const [updated] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM emails WHERE id = ?',
      [id]
    );

    connection.release();
    res.json((updated as unknown as Email[])[0]);
  } catch (error) {
    console.error('Error linking email to promo:', error);
    res.status(500).json({ error: 'Failed to link email to promo' });
  }
};
