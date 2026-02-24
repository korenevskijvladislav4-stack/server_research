import prisma from '../../lib/prisma';

export const profileFieldService = {
  async getAll() {
    return prisma.profile_fields.findMany({ orderBy: [{ sort_order: 'asc' }, { name: 'asc' }] });
  },
  async getById(id: number) {
    return prisma.profile_fields.findUnique({ where: { id } });
  },
  async create(data: { name: string; sort_order?: number; is_active?: boolean }) {
    return prisma.profile_fields.create({
      data: { name: data.name, sort_order: data.sort_order ?? 0, is_active: data.is_active !== false },
    });
  },
  async update(id: number, data: Partial<{ name: string; sort_order: number; is_active: boolean }>) {
    return prisma.profile_fields.update({ where: { id }, data });
  },
  async delete(id: number) {
    return prisma.profile_fields.delete({ where: { id } });
  },
};
