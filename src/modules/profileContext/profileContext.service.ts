import prisma from '../../lib/prisma';

export const profileContextService = {
  async getAll() {
    return prisma.profile_contexts.findMany({ orderBy: [{ sort_order: 'asc' }, { name: 'asc' }] });
  },
  async getById(id: number) {
    return prisma.profile_contexts.findUnique({ where: { id } });
  },
  async create(data: { name: string; sort_order?: number; is_active?: boolean }) {
    return prisma.profile_contexts.create({
      data: { name: data.name, sort_order: data.sort_order ?? 0, is_active: data.is_active !== false },
    });
  },
  async update(id: number, data: Partial<{ name: string; sort_order: number; is_active: boolean }>) {
    return prisma.profile_contexts.update({ where: { id }, data });
  },
  async delete(id: number) {
    return prisma.profile_contexts.delete({ where: { id } });
  },
};
