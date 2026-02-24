import prisma from '../../lib/prisma';
import { casinos, casinos_status } from '@prisma/client';
import { geoToJson, geoFromDb } from '../../common/utils/geo.utils';
import { parseQueryParams } from '../../common/utils';
import { calculateTotalPages } from '../../common/utils/query.utils';

export interface CasinoDto {
  id: number;
  name: string;
  website?: string | null;
  description?: string | null;
  geo?: string[] | null;
  is_our?: boolean | null;
  status: string;
  created_at?: Date | null;
  updated_at?: Date | null;
  created_by?: number | null;
}

function toCasinoDto(row: casinos): CasinoDto {
  return {
    id: row.id,
    name: row.name,
    website: row.website,
    description: row.description,
    geo: geoFromDb(row.geo),
    is_our: row.is_our ?? false,
    status: row.status ?? 'pending',
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
  };
}

const ALLOWED_SORT = ['id', 'name', 'created_at', 'updated_at', 'status'] as const;
const DEFAULT_SORT = 'created_at';

export const casinoService = {
  async findAll(params: ReturnType<typeof parseQueryParams>): Promise<{ data: CasinoDto[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const sortField = (params.sortField && ALLOWED_SORT.includes(params.sortField as any)) ? params.sortField : DEFAULT_SORT;
    const sortOrder = params.sortOrder === 'desc' ? 'desc' : 'asc';

    const where: Record<string, unknown> = {};
    const filters = params.filters ?? {};
    if (filters.status !== undefined && filters.status !== '') where.status = filters.status as casinos_status;
    if (filters.is_our !== undefined && filters.is_our !== '') where.is_our = filters.is_our === true || filters.is_our === 'true' || filters.is_our === 1;
    if (params.search && String(params.search).trim()) {
      const q = `%${String(params.search).trim()}%`;
      where.OR = [
        { name: { contains: q } },
        { website: { contains: q } },
        { description: { contains: q } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.casinos.count({ where }),
      prisma.casinos.findMany({
        where,
        orderBy: { [sortField]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data: rows.map(toCasinoDto),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: calculateTotalPages(total, pageSize),
      },
    };
  },

  async findById(id: number | string): Promise<CasinoDto | null> {
    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    if (isNaN(numId)) return null;
    const row = await prisma.casinos.findUnique({ where: { id: numId } });
    return row ? toCasinoDto(row) : null;
  },

  async create(data: { name: string; website?: string; description?: string; geo?: string[]; is_our?: boolean; status?: string }, userId?: number): Promise<CasinoDto> {
    const geoJson = data.geo && data.geo.length ? geoToJson(data.geo) : null;
    const row = await prisma.casinos.create({
      data: {
        name: data.name,
        website: data.website ?? null,
        description: data.description ?? null,
        geo: geoJson as any,
        is_our: data.is_our ?? false,
        status: (data.status as casinos_status) ?? 'pending',
        created_by: userId ?? null,
      },
    });
    return toCasinoDto(row);
  },

  async update(id: number | string, data: { name?: string; website?: string; description?: string; geo?: string[]; is_our?: boolean; status?: string }): Promise<CasinoDto | null> {
    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    if (isNaN(numId)) return null;
    const existing = await prisma.casinos.findUnique({ where: { id: numId } });
    if (!existing) return null;

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.website !== undefined) updateData.website = data.website;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.geo !== undefined) updateData.geo = data.geo?.length ? geoToJson(data.geo) : null;
    if (data.is_our !== undefined) updateData.is_our = data.is_our;
    if (data.status !== undefined) updateData.status = data.status;

    const row = await prisma.casinos.update({
      where: { id: numId },
      data: updateData as any,
    });
    return toCasinoDto(row);
  },

  async delete(id: number | string): Promise<boolean> {
    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    if (isNaN(numId)) return false;
    try {
      await prisma.casinos.delete({ where: { id: numId } });
      return true;
    } catch {
      return false;
    }
  },
};
