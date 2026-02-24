import prisma from '../../lib/prisma';
import { tags } from '@prisma/client';

export const tagService = {
  async list(): Promise<tags[]> {
    return prisma.tags.findMany({ orderBy: { name: 'asc' } });
  },

  async create(name: string, color?: string): Promise<tags> {
    return prisma.tags.create({
      data: {
        name: name.trim(),
        color: color?.trim() || '#1677ff',
      },
    });
  },

  async delete(id: number): Promise<boolean> {
    try {
      await prisma.tags.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  },

  async getByCasinoId(casinoId: number): Promise<tags[]> {
    return prisma.tags.findMany({
      where: { casino_tags: { some: { casino_id: casinoId } } },
      orderBy: { name: 'asc' },
    });
  },

  async setForCasino(casinoId: number, tagIds: number[]): Promise<tags[]> {
    await prisma.$transaction(async (tx) => {
      await tx.casino_tags.deleteMany({ where: { casino_id: casinoId } });
      if (tagIds.length > 0) {
        await tx.casino_tags.createMany({
          data: tagIds.map((tag_id) => ({ casino_id: casinoId, tag_id })),
        });
      }
    });
    return this.getByCasinoId(casinoId);
  },

  async getAllCasinoTags(): Promise<Record<number, { id: number; name: string; color: string | null }[]>> {
    const rows = await prisma.casino_tags.findMany({
      include: { tags: true },
      orderBy: { tags: { name: 'asc' } },
    });
    const map: Record<number, { id: number; name: string; color: string | null }[]> = {};
    for (const r of rows) {
      if (!map[r.casino_id]) map[r.casino_id] = [];
      map[r.casino_id].push({
        id: r.tags.id,
        name: r.tags.name,
        color: r.tags.color,
      });
    }
    return map;
  },
};
