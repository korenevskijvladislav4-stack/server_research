import prisma from '../../lib/prisma';
import { calculateTotalPages } from '../../common/utils/query.utils';
import { parseQueryParams } from '../../common/utils';
import { Prisma } from '@prisma/client';

export const accountTransactionService = {
  async create(accountId: number, data: any, createdBy: number | null) {
    const account = await prisma.casino_accounts.findUnique({ where: { id: accountId } });
    if (!account) return null;

    const date = data.transaction_date || new Date().toISOString().slice(0, 10);
    const tx = await prisma.account_transactions.create({
      data: {
        account_id: accountId,
        type: data.type,
        amount: new Prisma.Decimal(data.amount),
        currency: data.currency ?? null,
        transaction_date: new Date(date),
        notes: data.notes ?? null,
        created_by: createdBy,
      },
    });

    const row = await prisma.account_transactions.findUnique({
      where: { id: tx.id },
      include: {
        casino_accounts: {
          include: {
            casinos: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      account_id: row.account_id,
      type: row.type,
      amount: Number(row.amount),
      currency: row.currency,
      transaction_date: row.transaction_date,
      notes: row.notes,
      created_at: row.created_at,
      created_by: row.created_by,
      casino_id: row.casino_accounts.casino_id,
      geo: row.casino_accounts.geo,
      email: row.casino_accounts.email,
      casino_name: row.casino_accounts.casinos?.name ?? null,
    };
  },

  async getTransactions(query: any) {
    const params = parseQueryParams(query);
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;

    const accountId = query.account_id ? Number(query.account_id) : undefined;
    const casinoId = query.casino_id ? Number(query.casino_id) : undefined;
    const type = query.type as string | undefined;
    const dateFrom = query.date_from as string | undefined;
    const dateTo = query.date_to as string | undefined;

    const where: Prisma.account_transactionsWhereInput = {};
    if (accountId) where.account_id = accountId;
    if (casinoId) where.casino_accounts = { casino_id: casinoId };
    if (type && (type === 'deposit' || type === 'withdrawal')) where.type = type as any;
    if (dateFrom) where.transaction_date = { ...(where.transaction_date as any), gte: new Date(dateFrom) };
    if (dateTo) where.transaction_date = { ...(where.transaction_date as any), lte: new Date(dateTo) };

    const [total, rows] = await Promise.all([
      prisma.account_transactions.count({ where }),
      prisma.account_transactions.findMany({
        where,
        include: {
          casino_accounts: {
            include: {
              casinos: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ transaction_date: 'desc' }, { created_at: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const data = rows.map((r) => ({
      id: r.id,
      account_id: r.account_id,
      type: r.type,
      amount: Number(r.amount),
      currency: r.currency,
      transaction_date: r.transaction_date,
      notes: r.notes,
      created_at: r.created_at,
      created_by: r.created_by,
      casino_id: r.casino_accounts.casino_id,
      geo: r.casino_accounts.geo,
      email: r.casino_accounts.email,
      casino_name: r.casino_accounts.casinos?.name ?? null,
    }));

    return {
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: calculateTotalPages(total, pageSize),
      },
    };
  },

  async getAccountTotals(accountId: number) {
    const agg = await prisma.account_transactions.groupBy({
      by: ['type'],
      where: { account_id: accountId },
      _sum: { amount: true },
    });
    const deposits = agg.find((g) => g.type === 'deposit');
    const withdrawals = agg.find((g) => g.type === 'withdrawal');
    return {
      total_deposits: Number(deposits?._sum.amount ?? 0),
      total_withdrawals: Number(withdrawals?._sum.amount ?? 0),
    };
  },

  async exportForXlsx(query: any) {
    const accountId = query.account_id ? Number(query.account_id) : undefined;
    const casinoId = query.casino_id ? Number(query.casino_id) : undefined;
    const type = query.type as string | undefined;
    const dateFrom = query.date_from as string | undefined;
    const dateTo = query.date_to as string | undefined;

    const where: Prisma.account_transactionsWhereInput = {};
    if (accountId) where.account_id = accountId;
    if (casinoId) where.casino_accounts = { casino_id: casinoId };
    if (type && (type === 'deposit' || type === 'withdrawal')) where.type = type as any;
    if (dateFrom) where.transaction_date = { ...(where.transaction_date as any), gte: new Date(dateFrom) };
    if (dateTo) where.transaction_date = { ...(where.transaction_date as any), lte: new Date(dateTo) };

    const rows = await prisma.account_transactions.findMany({
      where,
      include: {
        casino_accounts: {
          include: {
            casinos: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ transaction_date: 'desc' }, { created_at: 'desc' }],
      take: 10000,
    });

    return rows.map((r) => ({
      id: r.id,
      account_id: r.account_id,
      type: r.type,
      amount: Number(r.amount),
      currency: r.currency,
      transaction_date: r.transaction_date,
      notes: r.notes,
      created_at: r.created_at,
      created_by: r.created_by,
      casino_id: r.casino_accounts.casino_id,
      geo: r.casino_accounts.geo,
      email: r.casino_accounts.email,
      casino_name: r.casino_accounts.casinos?.name ?? null,
    }));
  },
};

