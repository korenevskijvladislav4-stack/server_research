import prisma from '../../lib/prisma';
import {
  SlotSelector,
  CreateSlotSelectorDto,
  UpdateSlotSelectorDto,
} from '../../models/SlotSelector';
import { Prisma } from '@prisma/client';

export const slotSelectorService = {
  async getSelectorsByCasino(casinoId: number): Promise<SlotSelector[]> {
    const rows = await prisma.slot_selectors.findMany({
      where: { casino_id: casinoId },
      orderBy: [{ geo: 'asc' }, { category: 'asc' }],
    });

    return rows.map<SlotSelector>((row) => ({
      id: row.id,
      casino_id: row.casino_id,
      geo: row.geo,
      section: row.section,
      category: row.category,
      selector: row.selector,
      url: row.url,
      created_at: row.created_at ?? undefined,
      updated_at: row.updated_at ?? undefined,
    }));
  },

  async createSelector(data: CreateSlotSelectorDto): Promise<SlotSelector> {
    const row = await prisma.slot_selectors.create({
      data: {
        casino_id: data.casino_id,
        geo: data.geo.toUpperCase(),
        section: data.section,
        category: data.category ?? null,
        selector: data.selector,
        url: data.url ?? null,
      },
    });

    return {
      id: row.id,
      casino_id: row.casino_id,
      geo: row.geo,
      section: row.section,
      category: row.category,
      selector: row.selector,
      url: row.url,
      created_at: row.created_at ?? undefined,
      updated_at: row.updated_at ?? undefined,
    };
  },

  async updateSelector(id: number, data: UpdateSlotSelectorDto): Promise<SlotSelector | null> {
    const updateData: Prisma.slot_selectorsUpdateInput = {
      updated_at: new Date(),
    };

    if (data.geo !== undefined) {
      updateData.geo = data.geo.toUpperCase();
    }
    if (data.section !== undefined) {
      updateData.section = data.section;
    }
    if (data.category !== undefined) {
      updateData.category = data.category ?? null;
    }
    if (data.selector !== undefined) {
      updateData.selector = data.selector;
    }
    if (data.url !== undefined) {
      updateData.url = data.url ?? null;
    }

    if (Object.keys(updateData).length === 1) {
      const existing = await prisma.slot_selectors.findUnique({ where: { id } });
      if (!existing) return null;
      return {
        id: existing.id,
        casino_id: existing.casino_id,
        geo: existing.geo,
        section: existing.section,
        category: existing.category,
        selector: existing.selector,
        url: existing.url,
        created_at: existing.created_at ?? undefined,
        updated_at: existing.updated_at ?? undefined,
      };
    }

    const row = await prisma.slot_selectors.update({
      where: { id },
      data: updateData,
    });

    return {
      id: row.id,
      casino_id: row.casino_id,
      geo: row.geo,
      section: row.section,
      category: row.category,
      selector: row.selector,
      url: row.url,
      created_at: row.created_at ?? undefined,
      updated_at: row.updated_at ?? undefined,
    };
  },

  async deleteSelector(id: number): Promise<void> {
    await prisma.slot_selectors.deleteMany({
      where: { id },
    });
  },
};

