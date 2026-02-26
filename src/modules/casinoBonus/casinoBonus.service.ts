import prisma from '../../lib/prisma';
import { Prisma } from '@prisma/client';

const allowedSortFields = [
  'id',
  'casino_id',
  'geo',
  'name',
  'bonus_category',
  'bonus_kind',
  'bonus_type',
  'status',
  'created_at',
  'updated_at',
] as const;
const sortFieldToCasinoName: Record<string, string> = {
  casino_name: 'casinos', // sort by relation
};

export type BonusFilters = {
  casino_id?: unknown;
  geo?: unknown;
  bonus_category?: unknown;
  bonus_kind?: unknown;
  bonus_type?: unknown;
  status?: unknown;
};

function toPrismaWhere(
  filters: BonusFilters,
  search: string | undefined
): Prisma.casino_bonusesWhereInput {
  const where: Prisma.casino_bonusesWhereInput = {};

  if (filters?.casino_id !== undefined && filters.casino_id !== '') {
    where.casino_id = Array.isArray(filters.casino_id)
      ? { in: (filters.casino_id as unknown[]).map(Number) }
      : Number(filters.casino_id);
  }
  if (filters?.geo !== undefined && filters.geo !== '') {
    where.geo = Array.isArray(filters.geo) ? { in: filters.geo as string[] } : String(filters.geo);
  }
  if (filters?.bonus_category !== undefined && filters.bonus_category !== '') {
    where.bonus_category = String(filters.bonus_category) as any;
  }
  if (filters?.bonus_kind !== undefined && filters.bonus_kind !== '') {
    where.bonus_kind = String(filters.bonus_kind) as any;
  }
  if (filters?.bonus_type !== undefined && filters.bonus_type !== '') {
    where.bonus_type = String(filters.bonus_type) as any;
  }
  if (filters?.status !== undefined && filters.status !== '') {
    where.status = String(filters.status) as any;
  }

  if (search && search.trim()) {
    where.OR = [
      { name: { contains: search.trim() } },
      { promo_code: { contains: search.trim() } },
      { casinos: { name: { contains: search.trim() } } },
    ];
  }

  return Object.keys(where).length > 0 ? where : {};
}

export const casinoBonusService = {
  async getAllBonuses(params: {
    page?: number;
    pageSize?: number;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
    search?: string;
    filters?: BonusFilters;
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
      prisma.casino_bonuses.count({ where }),
      prisma.casino_bonuses.findMany({
        where,
        include: { casinos: { select: { name: true } } },
        orderBy: sortFieldToCasinoName[sortField]
          ? { casinos: { name: sortOrder } }
          : { [sortField]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const rows = data.map((b) => ({
      ...b,
      casino_name: b.casinos?.name ?? null,
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

  async getAllBonusesForExport(params: {
    search?: string;
    filters?: BonusFilters;
  }) {
    const where = toPrismaWhere(params.filters ?? {}, params.search);
    return prisma.casino_bonuses.findMany({
      where,
      include: { casinos: { select: { name: true } } },
      orderBy: { created_at: 'desc' },
      take: 10000,
    });
  },

  async listByCasino(casinoId: number, geo?: string) {
    const where: Prisma.casino_bonusesWhereInput = { casino_id: casinoId };
    if (geo) where.geo = geo;
    return prisma.casino_bonuses.findMany({
      where,
      orderBy: [{ geo: 'asc' }, { name: 'asc' }],
    });
  },

  async create(casinoId: number, data: Record<string, unknown>, actorId: number | null) {
    const bonus = await prisma.casino_bonuses.create({
      data: {
        casino_id: casinoId,
        geo: String(data.geo),
        name: String(data.name),
        bonus_category: (data.bonus_category as any) ?? 'casino',
        bonus_kind: (data.bonus_kind as any) ?? null,
        bonus_type: (data.bonus_type as any) ?? null,
        bonus_value: data.bonus_value != null ? Number(data.bonus_value) : null,
        bonus_unit: (data.bonus_unit as any) ?? null,
        currency: data.currency != null ? String(data.currency) : null,
        freespins_count: data.freespins_count != null ? Number(data.freespins_count) : null,
        freespin_value: data.freespin_value != null ? Number(data.freespin_value) : null,
        freespin_game: data.freespin_game != null ? String(data.freespin_game) : null,
        cashback_percent: data.cashback_percent != null ? Number(data.cashback_percent) : null,
        cashback_period: data.cashback_period != null ? String(data.cashback_period) : null,
        min_deposit: data.min_deposit != null ? Number(data.min_deposit) : null,
        max_bonus: data.max_bonus != null ? Number(data.max_bonus) : null,
        max_cashout: data.max_cashout != null ? Number(data.max_cashout) : null,
        max_win_cash_value: data.max_win_cash_value != null ? Number(data.max_win_cash_value) : null,
        max_win_cash_unit: data.max_win_cash_unit != null ? String(data.max_win_cash_unit) : null,
        max_win_freespin_value:
          data.max_win_freespin_value != null ? Number(data.max_win_freespin_value) : null,
        max_win_freespin_unit:
          data.max_win_freespin_unit != null ? String(data.max_win_freespin_unit) : null,
        max_win_percent_value:
          data.max_win_percent_value != null ? Number(data.max_win_percent_value) : null,
        max_win_percent_unit:
          data.max_win_percent_unit != null ? String(data.max_win_percent_unit) : null,
        wagering_requirement:
          data.wagering_requirement != null ? Number(data.wagering_requirement) : null,
        wagering_freespin: data.wagering_freespin != null ? Number(data.wagering_freespin) : null,
        wagering_games: data.wagering_games != null ? String(data.wagering_games) : null,
        wagering_time_limit:
          data.wagering_time_limit != null ? String(data.wagering_time_limit) : null,
        promo_code: data.promo_code != null ? String(data.promo_code) : null,
        valid_from: data.valid_from ? new Date(data.valid_from as string) : null,
        valid_to: data.valid_to ? new Date(data.valid_to as string) : null,
        status: (data.status as any) ?? 'active',
        notes: data.notes != null ? String(data.notes) : null,
        created_by: actorId,
        updated_by: actorId,
      },
    });
    return bonus;
  },

  async getById(id: number, casinoId?: number) {
    const where: Prisma.casino_bonusesWhereInput = { id };
    if (casinoId != null) where.casino_id = casinoId;
    return prisma.casino_bonuses.findFirst({ where });
  },

  async update(
    id: number,
    _casinoId: number,
    data: Record<string, unknown>,
    actorId: number | null
  ) {
    const toNum = (v: unknown): number | null =>
      v === '' || v === undefined || v === null ? null : Number(v);
    const toStr = (v: unknown): string | null =>
      v === '' || v === undefined || v === null ? null : String(v);

    const updatePayload: Prisma.casino_bonusesUpdateInput = {
      ...(actorId != null && {
        users_casino_bonuses_updated_byTousers: { connect: { id: actorId } },
      }),
      ...(data.geo !== undefined && { geo: String(data.geo) }),
      ...(data.name !== undefined && { name: String(data.name) }),
      ...(data.bonus_category !== undefined && { bonus_category: data.bonus_category as any }),
      ...(data.bonus_kind !== undefined && { bonus_kind: data.bonus_kind as any }),
      ...(data.bonus_type !== undefined && { bonus_type: data.bonus_type as any }),
      ...(data.bonus_value !== undefined && { bonus_value: toNum(data.bonus_value) }),
      ...(data.bonus_unit !== undefined && { bonus_unit: data.bonus_unit as any }),
      ...(data.currency !== undefined && { currency: toStr(data.currency) }),
      ...(data.freespins_count !== undefined && { freespins_count: toNum(data.freespins_count) }),
      ...(data.freespin_value !== undefined && { freespin_value: toNum(data.freespin_value) }),
      ...(data.freespin_game !== undefined && { freespin_game: toStr(data.freespin_game) }),
      ...(data.cashback_percent !== undefined && {
        cashback_percent: toNum(data.cashback_percent),
      }),
      ...(data.cashback_period !== undefined && {
        cashback_period: toStr(data.cashback_period),
      }),
      ...(data.min_deposit !== undefined && { min_deposit: toNum(data.min_deposit) }),
      ...(data.max_bonus !== undefined && { max_bonus: toNum(data.max_bonus) }),
      ...(data.max_cashout !== undefined && { max_cashout: toNum(data.max_cashout) }),
      ...(data.max_win_cash_value !== undefined && {
        max_win_cash_value: toNum(data.max_win_cash_value),
      }),
      ...(data.max_win_cash_unit !== undefined && {
        max_win_cash_unit: toStr(data.max_win_cash_unit),
      }),
      ...(data.max_win_freespin_value !== undefined && {
        max_win_freespin_value: toNum(data.max_win_freespin_value),
      }),
      ...(data.max_win_freespin_unit !== undefined && {
        max_win_freespin_unit: toStr(data.max_win_freespin_unit),
      }),
      ...(data.max_win_percent_value !== undefined && {
        max_win_percent_value: toNum(data.max_win_percent_value),
      }),
      ...(data.max_win_percent_unit !== undefined && {
        max_win_percent_unit: toStr(data.max_win_percent_unit),
      }),
      ...(data.wagering_requirement !== undefined && {
        wagering_requirement: toNum(data.wagering_requirement),
      }),
      ...(data.wagering_freespin !== undefined && {
        wagering_freespin: toNum(data.wagering_freespin),
      }),
      ...(data.wagering_games !== undefined && { wagering_games: toStr(data.wagering_games) }),
      ...(data.wagering_time_limit !== undefined && {
        wagering_time_limit: toStr(data.wagering_time_limit),
      }),
      ...(data.promo_code !== undefined && { promo_code: toStr(data.promo_code) }),
      ...(data.valid_from !== undefined && {
        valid_from: data.valid_from ? new Date(data.valid_from as string) : null,
      }),
      ...(data.valid_to !== undefined && {
        valid_to: data.valid_to ? new Date(data.valid_to as string) : null,
      }),
      ...(data.status !== undefined && { status: data.status as any }),
      ...(data.notes !== undefined && { notes: toStr(data.notes) }),
    };

    const after = await prisma.casino_bonuses.update({
      where: { id },
      data: updatePayload,
    });
    return after;
  },

  async delete(id: number, casinoId: number) {
    const existing = await prisma.casino_bonuses.findFirst({
      where: { id, casino_id: casinoId },
    });
    if (!existing) return null;
    return prisma.casino_bonuses.delete({ where: { id } });
  },

  async addBonusImage(casinoId: number, bonusId: number, filePath: string, originalName?: string) {
    return prisma.casino_bonus_images.create({
      data: {
        casino_id: casinoId,
        bonus_id: bonusId,
        file_path: filePath,
        original_name: originalName ?? null,
      },
    });
  },

  async getBonusImages(bonusId: number) {
    return prisma.casino_bonus_images.findMany({
      where: { bonus_id: bonusId },
      orderBy: { created_at: 'desc' },
    });
  },

  async getBonusImageById(imageId: number) {
    return prisma.casino_bonus_images.findUnique({
      where: { id: imageId },
    });
  },

  async deleteBonusImage(imageId: number) {
    return prisma.casino_bonus_images.delete({
      where: { id: imageId },
    });
  },
};
