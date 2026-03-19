import { Response } from 'express';
import ExcelJS from 'exceljs';
import { AuthRequest } from '../../middleware/auth.middleware';
import { accountTransactionService } from './accountTransaction.service';
import { AppError } from '../../errors/AppError';

export async function createTransaction(req: AuthRequest, res: Response): Promise<void> {
  const accountId = Number(req.params.accountId);
  const body = req.body ?? {};
  if (!accountId || !body.type || body.amount == null) {
    throw new AppError(400, 'ID аккаунта, тип и сумма обязательны');
  }
  if (body.type !== 'deposit' && body.type !== 'withdrawal') {
    throw new AppError(400, 'Тип должен быть deposit или withdrawal');
  }
  const numAmount = Number(body.amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    throw new AppError(400, 'Сумма должна быть положительным числом');
  }
  const created = await accountTransactionService.create(
    accountId,
    body,
    req.user?.id ?? null
  );
  if (!created) {
    throw new AppError(404, 'Аккаунт не найден');
  }
  res.status(201).json(created);
}

export async function getTransactions(req: AuthRequest, res: Response): Promise<void> {
  const result = await accountTransactionService.getTransactions(req.query);
  res.json(result);
}

export async function getAccountTotals(req: AuthRequest, res: Response): Promise<void> {
  const accountId = Number(req.params.accountId);
  if (!accountId) {
    throw new AppError(400, 'ID аккаунта обязателен');
  }
  const totals = await accountTransactionService.getAccountTotals(accountId);
  res.json(totals);
}

export async function exportTransactionsXlsx(req: AuthRequest, res: Response): Promise<void> {
  const rows = await accountTransactionService.exportForXlsx(req.query);
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

  sheet.getRow(1).font = { bold: true };

  for (const r of rows as any[]) {
    sheet.addRow({
      transaction_date: r.transaction_date
        ? new Date(r.transaction_date).toLocaleDateString('ru-RU')
        : '',
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
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}
