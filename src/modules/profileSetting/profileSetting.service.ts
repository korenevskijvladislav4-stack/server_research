import prisma from '../../lib/prisma';
import { Prisma } from '@prisma/client';

export const profileSettingService = {
  async getByCasino(casinoId: number, geo?: string) {
    const where: Prisma.profile_settingsWhereInput = { casino_id: casinoId };
    if (geo) where.geo = geo;
    return prisma.profile_settings.findMany({ where });
  },

  async upsert(casinoId: number, geo: string, field_id: number, context_id: number, value: boolean) {
    return prisma.profile_settings.upsert({
      where: {
        casino_id_geo_field_id_context_id: { casino_id: casinoId, geo, field_id, context_id },
      },
      create: { casino_id: casinoId, geo, field_id, context_id, value },
      update: { value },
    });
  },

  async batchUpsert(casinoId: number, geo: string, settings: Array<{ field_id: number; context_id: number; value: boolean }>) {
    await prisma.$transaction(
      settings.map((s) =>
        prisma.profile_settings.upsert({
          where: {
            casino_id_geo_field_id_context_id: {
              casino_id: casinoId,
              geo,
              field_id: s.field_id,
              context_id: s.context_id,
            },
          },
          create: { casino_id: casinoId, geo, field_id: s.field_id, context_id: s.context_id, value: s.value },
          update: { value: s.value },
        })
      )
    );
    return prisma.profile_settings.findMany({ where: { casino_id: casinoId, geo } });
  },

  async getAggregated(filters: { geo?: string; casino_ids?: number[] }) {
    const where: Prisma.profile_settingsWhereInput = { value: true };
    if (filters.geo) where.geo = filters.geo;
    if (filters.casino_ids?.length) where.casino_id = { in: filters.casino_ids };
    const rows = await prisma.profile_settings.findMany({
      where,
      include: { casinos: { select: { id: true, name: true } } },
      orderBy: [{ field_id: 'asc' }, { context_id: 'asc' }, { casinos: { name: 'asc' } }],
    });
    const grouped: Record<string, { field_id: number; context_id: number; casinos: Array<{ id: number; name: string; geo: string }>; count: number }> = {};
    for (const row of rows) {
      const key = `${row.field_id}_${row.context_id}`;
      if (!grouped[key]) {
        grouped[key] = { field_id: row.field_id, context_id: row.context_id, casinos: [], count: 0 };
      }
      grouped[key].casinos.push({
        id: row.casinos.id,
        name: row.casinos.name,
        geo: row.geo,
      });
      grouped[key].count++;
    }
    return Object.values(grouped);
  },
};
