import prisma from '../../lib/prisma';

export const casinoHistoryService = {
  async list(casinoId: number, limit: number, offset: number) {
    const [total, data] = await Promise.all([
      prisma.casino_profile_history.count({ where: { casino_id: casinoId } }),
      prisma.casino_profile_history.findMany({
        where: { casino_id: casinoId },
        include: {
          users: { select: { username: true } },
          casino_profile_fields: { select: { label: true, key_name: true } },
        },
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);
    const rows = data.map((h) => ({
      ...h,
      actor_username: h.users?.username ?? null,
      field_label: h.casino_profile_fields?.label ?? null,
      field_key: h.casino_profile_fields?.key_name ?? null,
      users: undefined,
      casino_profile_fields: undefined,
    }));
    return { data: rows, total, limit, offset };
  },
};
