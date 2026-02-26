import prisma from '../../lib/prisma';
import { Prisma } from '@prisma/client';

const allowedSortFields = [
  'id',
  'casino_id',
  'geo',
  'direction',
  'type',
  'method',
  'min_amount',
  'max_amount',
  'currency',
  'created_at',
  'updated_at',
] as const;

export type PaymentFilters = {
  casino_id?: unknown;
  geo?: unknown;
  type?: unknown;
  method?: unknown;
  direction?: unknown;
};

function toPrismaWhere(
  filters: PaymentFilters,
  search: string | undefined
): Prisma.casino_paymentsWhereInput {
  const where: Prisma.casino_paymentsWhereInput = {};
  if (filters?.casino_id !== undefined && filters.casino_id !== '') {
    where.casino_id = Array.isArray(filters.casino_id)
      ? { in: (filters.casino_id as unknown[]).map(Number) }
      : Number(filters.casino_id);
  }
  if (filters?.geo !== undefined && filters.geo !== '') {
    where.geo = Array.isArray(filters.geo) ? { in: filters.geo as string[] } : String(filters.geo);
  }
  if (filters?.type !== undefined && filters.type !== '') {
    where.type = String(filters.type);
  }
  if (filters?.method !== undefined && filters.method !== '') {
    where.method = String(filters.method);
  }
  if (filters?.direction !== undefined && filters.direction !== '') {
    where.direction = String(filters.direction) as any;
  }
  if (search && search.trim()) {
    where.OR = [
      { type: { contains: search.trim() } },
      { method: { contains: search.trim() } },
      { casinos: { name: { contains: search.trim() } } },
    ];
  }
  return Object.keys(where).length > 0 ? where : {};
}

export const casinoPaymentService = {
  async getAllPayments(params: {
    page?: number;
    pageSize?: number;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
    search?: string;
    filters?: PaymentFilters;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const sortField =
      params.sortField && allowedSortFields.includes(params.sortField as any)
        ? params.sortField
        : 'created_at';
    const sortOrder = params.sortOrder === 'asc' ? 'asc' : 'desc';
    const where = toPrismaWhere(params.filters ?? {}, params.search);

    const [total, data] = await Promise.all([
      prisma.casino_payments.count({ where }),
      prisma.casino_payments.findMany({
        where,
        include: { casinos: { select: { name: true } } },
        orderBy: { [sortField]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const rows = data.map((p) => ({
      ...p,
      casino_name: p.casinos?.name ?? null,
      casinos: undefined,
    }));

    return {
      data: rows,
      total,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  },

  async getAllPaymentsForExport(params: { search?: string; filters?: PaymentFilters }) {
    const where = toPrismaWhere(params.filters ?? {}, params.search);
    return prisma.casino_payments.findMany({
      where,
      include: { casinos: { select: { name: true } } },
      orderBy: { created_at: 'desc' },
      take: 10000,
    });
  },

  async listByCasino(casinoId: number, geo?: string) {
    const where: Prisma.casino_paymentsWhereInput = { casino_id: casinoId };
    if (geo) where.geo = geo;
    return prisma.casino_payments.findMany({
      where,
      orderBy: [{ direction: 'asc' }, { geo: 'asc' }, { type: 'asc' }, { method: 'asc' }],
    });
  },

  async create(casinoId: number, data: Record<string, unknown>, actorId: number | null) {
    const direction =
      data.direction === 'withdrawal' ? 'withdrawal' : ('deposit' as 'deposit' | 'withdrawal');
    const payment = await prisma.casino_payments.create({
      data: {
        casino_id: casinoId,
        geo: String(data.geo),
        direction,
        type: String(data.type),
        method: String(data.method),
        min_amount: data.min_amount != null ? Number(data.min_amount) : null,
        max_amount: data.max_amount != null ? Number(data.max_amount) : null,
        currency: data.currency != null ? String(data.currency) : null,
        notes: data.notes != null ? String(data.notes) : null,
        created_by: actorId,
        updated_by: actorId,
      },
    });
    return payment;
  },

  async getById(id: number, casinoId?: number) {
    const where: Prisma.casino_paymentsWhereInput = { id };
    if (casinoId != null) where.casino_id = casinoId;
    return prisma.casino_payments.findFirst({ where });
  },

  async update(
    id: number,
    _casinoId: number,
    data: Record<string, unknown>,
    actorId: number | null
  ) {
    const direction =
      data.direction === 'withdrawal'
        ? ('withdrawal' as const)
        : data.direction === 'deposit'
          ? ('deposit' as const)
          : undefined;
    const updatePayload: Prisma.casino_paymentsUpdateInput = {
      ...(actorId != null && {
        users_casino_payments_updated_byTousers: { connect: { id: actorId } },
      }),
      ...(data.geo !== undefined && { geo: String(data.geo) }),
      ...(data.direction !== undefined && { direction: direction ?? (data.direction as any) }),
      ...(data.type !== undefined && { type: String(data.type) }),
      ...(data.method !== undefined && { method: String(data.method) }),
      ...(data.min_amount !== undefined && {
        min_amount: data.min_amount === null || data.min_amount === '' ? null : Number(data.min_amount),
      }),
      ...(data.max_amount !== undefined && {
        max_amount: data.max_amount === null || data.max_amount === '' ? null : Number(data.max_amount),
      }),
      ...(data.currency !== undefined && {
        currency: data.currency === null || data.currency === '' ? null : String(data.currency),
      }),
      ...(data.notes !== undefined && {
        notes: data.notes === null || data.notes === '' ? null : String(data.notes),
      }),
    };
    const after = await prisma.casino_payments.update({
      where: { id },
      data: updatePayload,
    });
    return after;
  },

  async delete(id: number, casinoId: number) {
    const existing = await prisma.casino_payments.findFirst({
      where: { id, casino_id: casinoId },
    });
    if (!existing) return null;
    return prisma.casino_payments.delete({ where: { id } });
  },

  async addPaymentImage(
    casinoId: number,
    paymentId: number,
    filePath: string,
    originalName?: string
  ) {
    return prisma.casino_payment_images.create({
      data: {
        casino_id: casinoId,
        payment_id: paymentId,
        file_path: filePath,
        original_name: originalName ?? null,
      },
    });
  },

  async getPaymentImages(paymentId: number) {
    return prisma.casino_payment_images.findMany({
      where: { payment_id: paymentId },
      orderBy: { created_at: 'desc' },
    });
  },

  async getPaymentImageById(imageId: number) {
    return prisma.casino_payment_images.findUnique({
      where: { id: imageId },
    });
  },

  async deletePaymentImage(imageId: number) {
    return prisma.casino_payment_images.delete({
      where: { id: imageId },
    });
  },
};
