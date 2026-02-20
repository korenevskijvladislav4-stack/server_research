import { Response } from 'express';
import { RowDataPacket } from 'mysql2';
import ExcelJS from 'exceljs';
import pool from '../database/connection';
import { AuthRequest } from '../middleware/auth.middleware';
import { CreateAccountTransactionDto } from '../models/AccountTransaction';
import {
  parseQueryParams,
  buildLimitClause,
  calculateTotalPages,
} from '../common/utils';

export const createTransaction = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const accountId = Number(req.params.accountId);
    const body: CreateAccountTransactionDto = req.body ?? {};
    const { type, amount, currency, transaction_date, notes } = body;

    if (!accountId || !type || amount == null) {
      res.status(400).json({ error: 'accountId, type and amount are required' });
      return;
    }
    if (type !== 'deposit' && type !== 'withdrawal') {
      res.status(400).json({ error: 'type must be deposit or withdrawal' });
      return;
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      res.status(400).json({ error: 'amount must be a positive number' });
      return;
    }

    const conn = await pool.getConnection();
    const [accountRows] = await conn.query<RowDataPacket[]>(
      'SELECT id FROM casino_accounts WHERE id = ?',
      [accountId]
    );
    if (!Array.isArray(accountRows) || accountRows.length === 0) {
      conn.release();
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const date = transaction_date || new Date().toISOString().slice(0, 10);
    const createdBy = req.user?.id ?? null;

    const [result] = await conn.query(
      `INSERT INTO account_transactions (account_id, type, amount, currency, transaction_date, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [accountId, type, numAmount, currency ?? null, date, notes ?? null, createdBy]
    );
    const insertId = (result as any).insertId;

    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT t.*, ca.casino_id, ca.geo, ca.email, c.name AS casino_name
       FROM account_transactions t
       JOIN casino_accounts ca ON t.account_id = ca.id
       LEFT JOIN casinos c ON ca.casino_id = c.id
       WHERE t.id = ?`,
      [insertId]
    );
    conn.release();

    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('createTransaction error:', e);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
};

export const getTransactions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const params = parseQueryParams(req.query);
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const accountId = req.query.account_id ? Number(req.query.account_id) : undefined;
    const casinoId = req.query.casino_id ? Number(req.query.casino_id) : undefined;
    const type = req.query.type as string | undefined;
    const dateFrom = req.query.date_from as string | undefined;
    const dateTo = req.query.date_to as string | undefined;

    const conn = await pool.getConnection();
    const conditions: string[] = [];
    const queryParams: any[] = [];

    if (accountId) {
      conditions.push('t.account_id = ?');
      queryParams.push(accountId);
    }
    if (casinoId) {
      conditions.push('ca.casino_id = ?');
      queryParams.push(casinoId);
    }
    if (type && (type === 'deposit' || type === 'withdrawal')) {
      conditions.push('t.type = ?');
      queryParams.push(type);
    }
    if (dateFrom) {
      conditions.push('t.transaction_date >= ?');
      queryParams.push(dateFrom);
    }
    if (dateTo) {
      conditions.push('t.transaction_date <= ?');
      queryParams.push(dateTo);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { clause: limitClause, params: limitParams } = buildLimitClause(page, pageSize);

    const [countRows] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total
       FROM account_transactions t
       JOIN casino_accounts ca ON t.account_id = ca.id
       ${whereClause}`,
      queryParams
    );
    const total = Number((countRows[0] as any)?.total ?? 0);

    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT t.*, ca.casino_id, ca.geo, ca.email, c.name AS casino_name
       FROM account_transactions t
       JOIN casino_accounts ca ON t.account_id = ca.id
       LEFT JOIN casinos c ON ca.casino_id = c.id
       ${whereClause}
       ORDER BY t.transaction_date DESC, t.created_at DESC
       ${limitClause}`,
      [...queryParams, ...limitParams]
    );
    conn.release();

    res.json({
      data: rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: calculateTotalPages(total, pageSize),
      },
    });
  } catch (e) {
    console.error('getTransactions error:', e);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
};

export const getAccountTotals = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const accountId = Number(req.params.accountId);
    if (!accountId) {
      res.status(400).json({ error: 'accountId required' });
      return;
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END), 0) AS total_deposits,
         COALESCE(SUM(CASE WHEN type = 'withdrawal' THEN amount ELSE 0 END), 0) AS total_withdrawals
       FROM account_transactions
       WHERE account_id = ?`,
      [accountId]
    );
    const r = rows[0] as any;
    res.json({
      total_deposits: Number(r?.total_deposits ?? 0),
      total_withdrawals: Number(r?.total_withdrawals ?? 0),
    });
  } catch (e) {
    console.error('getAccountTotals error:', e);
    res.status(500).json({ error: 'Failed to fetch totals' });
  }
};

// ---------------------------------------------------------------------------
// Export transactions as XLSX (with filters)
// ---------------------------------------------------------------------------

export const exportTransactionsXlsx = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const accountId = req.query.account_id ? Number(req.query.account_id) : undefined;
    const casinoId = req.query.casino_id ? Number(req.query.casino_id) : undefined;
    const type = req.query.type as string | undefined;
    const dateFrom = req.query.date_from as string | undefined;
    const dateTo = req.query.date_to as string | undefined;

    const conn = await pool.getConnection();
    const conditions: string[] = [];
    const queryParams: any[] = [];

    if (accountId) {
      conditions.push('t.account_id = ?');
      queryParams.push(accountId);
    }
    if (casinoId) {
      conditions.push('ca.casino_id = ?');
      queryParams.push(casinoId);
    }
    if (type && (type === 'deposit' || type === 'withdrawal')) {
      conditions.push('t.type = ?');
      queryParams.push(type);
    }
    if (dateFrom) {
      conditions.push('t.transaction_date >= ?');
      queryParams.push(dateFrom);
    }
    if (dateTo) {
      conditions.push('t.transaction_date <= ?');
      queryParams.push(dateTo);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT t.*, ca.casino_id, ca.geo, ca.email, c.name AS casino_name
       FROM account_transactions t
       JOIN casino_accounts ca ON t.account_id = ca.id
       LEFT JOIN casinos c ON ca.casino_id = c.id
       ${whereClause}
       ORDER BY t.transaction_date DESC, t.created_at DESC
       LIMIT 10000`,
      queryParams
    );
    conn.release();

    const transactions = rows as any[];

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Транзакции');

    sheet.columns = [
      { header: 'Дата', key: 'transaction_date', width: 12 },
      { header: 'Проект', key: 'casino_name', width: 22 },
      { header: 'GEO', key: 'geo', width: 10 },
      { header: 'Аккаунт (email)', key: 'email', width: 28 },
      { header: 'Тип', key: 'type', width: 12 },
      { header: 'Сумма', key: 'amount', width: 14 },
      { header: 'Валюта', key: 'currency', width: 10 },
      { header: 'Заметки', key: 'notes', width: 36 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };

    for (const r of transactions) {
      sheet.addRow({
        transaction_date: r.transaction_date ? new Date(r.transaction_date).toLocaleDateString('ru-RU') : '',
        casino_name: r.casino_name ?? '',
        geo: r.geo ?? '',
        email: r.email ?? '',
        type: r.type === 'deposit' ? 'Депозит' : 'Вывод',
        amount: r.amount,
        currency: r.currency ?? '',
        notes: r.notes ?? '',
      });
    }

    const filename = `transactions_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (e: any) {
    console.error('exportTransactionsXlsx error:', e?.message || e);
    res.status(500).json({ error: 'Failed to export transactions' });
  }
};
