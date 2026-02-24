import prisma from '../../lib/prisma';
import { geos } from '@prisma/client';

export const geoService = {
  async findAllActive(): Promise<geos[]> {
    return prisma.geos.findMany({
      where: { is_active: true },
      orderBy: [{ sort_order: 'asc' }, { code: 'asc' }],
    });
  },

  async create(code: string, name?: string): Promise<{ geo: geos; isNew: boolean }> {
    const codeUpper = code.trim().toUpperCase();
    const existing = await prisma.geos.findUnique({ where: { code: codeUpper } });
    if (existing) return { geo: existing, isNew: false };
    const created = await prisma.geos.create({
      data: {
        code: codeUpper,
        name: (name && name.trim()) || codeUpper,
        is_active: true,
        sort_order: 0,
      },
    });
    return { geo: created, isNew: true };
  },
};
