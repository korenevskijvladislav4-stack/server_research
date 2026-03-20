import prisma from '../../lib/prisma';
import { geos } from '@prisma/client';
import { AppError } from '../../errors/AppError';

/** Как в Prisma: geos.code VarChar(10), geos.name VarChar(100) */
const GEO_CODE_MAX_LEN = 10;
const GEO_NAME_MAX_LEN = 100;

export const geoService = {
  async findAllActive(): Promise<geos[]> {
    return prisma.geos.findMany({
      where: { is_active: true },
      orderBy: [{ sort_order: 'asc' }, { code: 'asc' }],
    });
  },

  /** Все записи (включая неактивные) — для админки справочников */
  async findAllOrdered(): Promise<geos[]> {
    return prisma.geos.findMany({
      orderBy: [{ sort_order: 'asc' }, { code: 'asc' }],
    });
  },

  async deleteById(id: number): Promise<void> {
    try {
      await prisma.geos.delete({ where: { id } });
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === 'P2025') {
        throw new AppError(404, 'GEO не найден');
      }
      throw e;
    }
  },

  async create(code: string, name?: string): Promise<{ geo: geos; isNew: boolean }> {
    const codeUpper = code.trim().toUpperCase();
    if (codeUpper.length > GEO_CODE_MAX_LEN) {
      throw new AppError(400, `Код GEO не длиннее ${GEO_CODE_MAX_LEN} символов`);
    }
    const resolvedName = (name && name.trim()) || codeUpper;
    if (resolvedName.length > GEO_NAME_MAX_LEN) {
      throw new AppError(400, `Название GEO не длиннее ${GEO_NAME_MAX_LEN} символов`);
    }
    const existing = await prisma.geos.findUnique({ where: { code: codeUpper } });
    if (existing) return { geo: existing, isNew: false };
    const created = await prisma.geos.create({
      data: {
        code: codeUpper,
        name: resolvedName,
        is_active: true,
        sort_order: 0,
      },
    });
    return { geo: created, isNew: true };
  },
};
