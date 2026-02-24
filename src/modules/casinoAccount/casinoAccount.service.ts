import prisma from '../../lib/prisma';
import { parseQueryParams } from '../../common/utils';
import { calculateTotalPages } from '../../common/utils/query.utils';
import { Prisma } from '@prisma/client';

const ALLOWED_SORT = [
  'id',
  'casino_id',
  'casino_name',
  'geo',
  'email',
  'phone',
  'owner_id',
  'owner_username',
  'last_modified_at',
  'created_at',
  'updated_at',
] as const;
const DEFAULT_SORT = 'last_modified_at';

function toAccountDto(row: any) {
  const deposit_count =
    row.account_transactions?.filter((t: any) => t.type === 'deposit').length ?? 0;
  const withdrawal_count =
    row.account_transactions?.filter((t: any) => t.type === 'withdrawal').length ?? 0;

  return {
    id: row.id,
    casino_id: row.casino_id,
    casino_name: row.casinos?.name ?? null,
    geo: row.geo,
    email: row.email,
    phone: row.phone,
    password: row.password,
    owner_id: row.owner_id,
    owner_username: row.users?.username ?? null,
    last_modified_at: row.last_modified_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deposit_count,
    withdrawal_count,
  };
}

export const casinoAccountService = {
  async getAll(params: ReturnType<typeof parseQueryParams>) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const sortField =
      params.sortField && ALLOWED_SORT.includes(params.sortField as any)
        ? params.sortField
        : DEFAULT_SORT;
    const sortOrder = params.sortOrder === 'asc' ? 'asc' : 'desc';

    const filters = params.filters ?? {};
    const where: Prisma.casino_accountsWhereInput = {};

    if (filters.casino_id !== undefined && filters.casino_id !== '') {
      where.casino_id = Array.isArray(filters.casino_id)
        ? { in: (filters.casino_id as unknown[]).map(Number) }
        : Number(filters.casino_id);
    }
    if (filters.geo !== undefined && filters.geo !== '') {
      where.geo = String(filters.geo);
    }
    if (filters.owner_id !== undefined && filters.owner_id !== '') {
      where.owner_id = Array.isArray(filters.owner_id)
        ? { in: (filters.owner_id as unknown[]).map(Number) }
        : Number(filters.owner_id);
    }

    if (params.search && String(params.search).trim()) {
      const q = String(params.search).trim();
      where.OR = [
        { email: { contains: q } },
        { phone: { contains: q } },
        { password: { contains: q } },
        { casinos: { name: { contains: q } } },
        { users: { username: { contains: q } } },
      ];
    }

    const orderBy: Prisma.casino_accountsOrderByWithRelationInput =
      sortField === 'casino_name'
        ? { casinos: { name: sortOrder } }
        : sortField === 'owner_username'
          ? { users: { username: sortOrder } }
          : { [sortField]: sortOrder } as any;

    const [total, rows] = await Promise.all([
      prisma.casino_accounts.count({ where }),
      prisma.casino_accounts.findMany({
        where,
        include: {
          casinos: { select: { name: true } },
          users: { select: { username: true } },
          account_transactions: true,
        },
        orderBy: [orderBy, { created_at: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data: rows.map(toAccountDto),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: calculateTotalPages(total, pageSize),
      },
    };
  },

  async getByCasino(casinoId: number) {
    const rows = await prisma.casino_accounts.findMany({
      where: { casino_id: casinoId },
      include: {
        users: { select: { username: true } },
        account_transactions: true,
      },
      orderBy: { created_at: 'desc' },
    });
    return rows.map((r) => ({
      ...toAccountDto(r),
      casino_name: undefined,
    }));
  },

  async create(casinoId: number, data: any) {
    const row = await prisma.casino_accounts.create({
      data: {
        casino_id: casinoId,
        geo: data.geo,
        email: data.email ?? null,
        phone: data.phone ?? null,
        password: data.password,
        owner_id: data.owner_id ?? null,
      },
      include: {
        users: { select: { username: true } },
      },
    });
    return {
      id: row.id,
      casino_id: row.casino_id,
      geo: row.geo,
      email: row.email,
      phone: row.phone,
      password: row.password,
      owner_id: row.owner_id,
      owner_username: row.users?.username ?? null,
      last_modified_at: row.last_modified_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  },

  async getById(id: number) {
    return prisma.casino_accounts.findUnique({
      where: { id },
      include: { users: { select: { username: true } } },
    });
  },

  async update(id: number, data: any) {
    const updateData: Prisma.casino_accountsUpdateInput = {};
    if (data.geo !== undefined) updateData.geo = data.geo;
    if (data.email !== undefined) updateData.email = data.email ?? null;
    if (data.phone !== undefined) updateData.phone = data.phone ?? null;
    if (data.password !== undefined) updateData.password = data.password;
    if (data.owner_id !== undefined) (updateData as any).owner_id = data.owner_id ?? null;
    updateData.last_modified_at = new Date();

    const row = await prisma.casino_accounts.update({
      where: { id },
      data: updateData,
      include: { users: { select: { username: true } } },
    });
    return {
      id: row.id,
      casino_id: row.casino_id,
      geo: row.geo,
      email: row.email,
      phone: row.phone,
      password: row.password,
      owner_id: row.owner_id,
      owner_username: row.users?.username ?? null,
      last_modified_at: row.last_modified_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  },

  async delete(id: number) {
    await prisma.casino_accounts.delete({ where: { id } });
  },
};

