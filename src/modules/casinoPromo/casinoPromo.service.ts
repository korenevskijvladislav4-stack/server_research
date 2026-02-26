import prisma from '../../lib/prisma';
import { Prisma } from '@prisma/client';

type PromoFilters = {
  casino_id?: unknown;
  geo?: unknown;
  promo_category?: unknown;
  promo_type?: unknown;
  status?: unknown;
};

function toWhere(filters: PromoFilters, search: string | undefined): Prisma.casino_promosWhereInput {
  const where: Prisma.casino_promosWhereInput = {};
  if (filters?.casino_id !== undefined && filters.casino_id !== '')
    where.casino_id = Array.isArray(filters.casino_id) ? { in: (filters.casino_id as unknown[]).map(Number) } : Number(filters.casino_id);
  if (filters?.geo !== undefined && filters.geo !== '')
    where.geo = Array.isArray(filters.geo) ? { in: filters.geo as string[] } : String(filters.geo);
  if (filters?.promo_category !== undefined && filters.promo_category !== '')
    where.promo_category = String(filters.promo_category) as any;
  if (filters?.promo_type !== undefined && filters.promo_type !== '')
    where.promo_type = String(filters.promo_type);
  if (filters?.status !== undefined && filters.status !== '')
    where.status = String(filters.status) as any;
  if (search?.trim())
    where.OR = [
      { name: { contains: search.trim() } },
      { promo_type: { contains: search.trim() } },
      { provider: { contains: search.trim() } },
      { casinos: { name: { contains: search.trim() } } },
    ];
  return Object.keys(where).length > 0 ? where : {};
}

const sortFields = ['name', 'geo', 'promo_category', 'period_start', 'created_at'] as const;

export const casinoPromoService = {
  async getAll(params: { page?: number; pageSize?: number; sortField?: string; sortOrder?: 'asc' | 'desc'; search?: string; filters?: PromoFilters }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const sortField = params.sortField && sortFields.includes(params.sortField as any) ? params.sortField : 'created_at';
    const sortOrder = params.sortOrder === 'asc' ? 'asc' : 'desc';
    const where = toWhere(params.filters ?? {}, params.search);
    const [total, data] = await Promise.all([
      prisma.casino_promos.count({ where }),
      prisma.casino_promos.findMany({
        where,
        include: { casinos: { select: { name: true } } },
        orderBy: { [sortField]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const rows = data.map((p) => ({ ...p, casino_name: p.casinos?.name ?? null, casinos: undefined }));
    return { data: rows, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  },

  async getAllForExport(params: { search?: string; filters?: PromoFilters }) {
    return prisma.casino_promos.findMany({
      where: toWhere(params.filters ?? {}, params.search),
      include: { casinos: { select: { name: true } } },
      orderBy: { created_at: 'desc' },
      take: 10000,
    });
  },

  async listByCasino(casinoId: number, geo?: string) {
    const where: Prisma.casino_promosWhereInput = { casino_id: casinoId };
    if (geo) where.geo = geo;
    return prisma.casino_promos.findMany({
      where,
      include: { casinos: { select: { name: true } } },
      orderBy: { created_at: 'desc' },
    });
  },

  async create(casinoId: number, data: Record<string, unknown>, actorId: number | null) {
    const promo = await prisma.casino_promos.create({
      data: {
        casino_id: casinoId,
        geo: String(data.geo),
        promo_category: (data.promo_category as any) ?? 'tournament',
        name: String(data.name),
        promo_type: data.promo_type != null ? String(data.promo_type) : null,
        period_start: data.period_start ? new Date(data.period_start as string) : null,
        period_end: data.period_end ? new Date(data.period_end as string) : null,
        period_type: (data.period_type as any) ?? 'fixed',
        has_participation_button:
          typeof data.has_participation_button === 'boolean'
            ? (data.has_participation_button as boolean)
            : false,
        provider: data.provider != null ? String(data.provider) : null,
        prize_fund: data.prize_fund != null ? String(data.prize_fund) : null,
        mechanics: data.mechanics != null ? String(data.mechanics) : null,
        min_bet: data.min_bet != null ? String(data.min_bet) : null,
        wagering_prize: data.wagering_prize != null ? String(data.wagering_prize) : null,
        status: (data.status as any) ?? 'active',
        created_by: actorId,
        updated_by: actorId,
      },
    });
    return promo;
  },

  async getById(id: number, casinoId?: number) {
    const where: Prisma.casino_promosWhereInput = { id };
    if (casinoId != null) where.casino_id = casinoId;
    return prisma.casino_promos.findFirst({ where, include: { casinos: { select: { name: true } } } });
  },

  async update(id: number, _casinoId: number, data: Record<string, unknown>, actorId: number | null) {
    const allow = [
      'geo',
      'promo_category',
      'name',
      'promo_type',
      'period_start',
      'period_end',
      'period_type',
      'has_participation_button',
      'provider',
      'prize_fund',
      'mechanics',
      'min_bet',
      'wagering_prize',
      'status',
    ];
    const updatePayload: Prisma.casino_promosUpdateInput = {};
    if (actorId != null) (updatePayload as any).users_casino_promos_updated_byTousers = { connect: { id: actorId } };
    for (const k of allow) {
      if ((data as any)[k] !== undefined) {
        const v = (data as any)[k];
        if ((k === 'period_start' || k === 'period_end') && v) {
          (updatePayload as any)[k] = new Date(v);
        } else if (k === 'has_participation_button') {
          (updatePayload as any)[k] = Boolean(v);
        } else {
          (updatePayload as any)[k] = v;
        }
      }
    }
    const after = await prisma.casino_promos.update({ where: { id }, data: updatePayload });
    return after;
  },

  async delete(id: number, casinoId: number) {
    const ex = await prisma.casino_promos.findFirst({ where: { id, casino_id: casinoId } });
    if (!ex) return null;
    return prisma.casino_promos.delete({ where: { id } });
  },

  async addImage(casinoId: number, promoId: number, filePath: string, originalName?: string) {
    return prisma.casino_promo_images.create({
      data: { casino_id: casinoId, promo_id: promoId, file_path: filePath, original_name: originalName ?? null },
    });
  },

  async getImages(promoId: number) {
    return prisma.casino_promo_images.findMany({ where: { promo_id: promoId }, orderBy: { created_at: 'desc' } });
  },

  async getImageById(imageId: number) {
    return prisma.casino_promo_images.findUnique({ where: { id: imageId } });
  },

  async deleteImage(imageId: number) {
    return prisma.casino_promo_images.delete({ where: { id: imageId } });
  },
};
