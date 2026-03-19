import prisma from '../../lib/prisma';
import { Slot } from '../../models/Slot';
import { Prisma } from '@prisma/client';

export const slotService = {
  async getSlotsByCasino(casinoId: number, geo?: string): Promise<Slot[]> {
    const where: Prisma.slotsWhereInput = {
      casino_id: casinoId,
      ...(geo
        ? {
            geo: String(geo).toUpperCase(),
          }
        : {}),
    };

    const rows = await prisma.slots.findMany({
      where,
      orderBy: [
        { geo: 'asc' },
        { is_featured: 'desc' },
        { is_popular: 'desc' },
        { is_new: 'desc' },
        { name: 'asc' },
      ],
    });

    return rows.map<Slot>((row) => ({
      id: row.id,
      casino_id: row.casino_id,
      geo: row.geo,
      name: row.name,
      provider: row.provider,
      image_url: row.image_url,
      description: row.description,
      rtp: row.rtp != null ? Number(row.rtp) : null,
      volatility: row.volatility,
      min_bet: row.min_bet != null ? Number(row.min_bet) : null,
      max_bet: row.max_bet != null ? Number(row.max_bet) : null,
      max_win: row.max_win != null ? Number(row.max_win) : null,
      features: Array.isArray(row.features)
        ? (row.features as string[])
        : row.features
        ? (() => {
            try {
              const parsed = JSON.parse(String(row.features));
              return Array.isArray(parsed) ? parsed : null;
            } catch {
              return null;
            }
          })()
        : null,
      tags: Array.isArray(row.tags)
        ? (row.tags as string[])
        : row.tags
        ? (() => {
            try {
              const parsed = JSON.parse(String(row.tags));
              return Array.isArray(parsed) ? parsed : null;
            } catch {
              return null;
            }
          })()
        : null,
      is_featured: row.is_featured ?? false,
      is_new: row.is_new ?? false,
      is_popular: row.is_popular ?? false,
      parsed_at: row.parsed_at ?? undefined,
      created_at: row.created_at ?? undefined,
      updated_at: row.updated_at ?? undefined,
    }));
  },

  async upsertParsedSlots(
    casinoId: number,
    results: { geo: string; slots: Slot[] }[],
  ): Promise<{
    savedCount: number;
    summary: { geo: string; count: number }[];
  }> {
    let savedCount = 0;
    const summary: { geo: string; count: number }[] = [];

    for (const { geo, slots } of results) {
      const geoUpper = geo.toUpperCase();
      let geoCount = 0;

      for (const slotData of slots) {
        const existing = await prisma.slots.findFirst({
          where: {
            casino_id: casinoId,
            geo: geoUpper,
            name: slotData.name,
          },
          select: { id: true },
        });

        const updatePayload: Prisma.slotsUpdateInput = {
          parsed_at: new Date(),
        };

        if (slotData.provider !== undefined) {
          updatePayload.provider = slotData.provider;
        }
        if (slotData.image_url !== undefined) {
          updatePayload.image_url = slotData.image_url;
        }
        if (slotData.description !== undefined) {
          updatePayload.description = slotData.description;
        }
        if (slotData.features !== undefined) {
          updatePayload.features =
            slotData.features != null ? (slotData.features as any) : undefined;
        }
        if (slotData.is_featured !== undefined) {
          updatePayload.is_featured = slotData.is_featured;
        }
        if (slotData.is_new !== undefined) {
          updatePayload.is_new = slotData.is_new;
        }
        if (slotData.is_popular !== undefined) {
          updatePayload.is_popular = slotData.is_popular;
        }

        if (existing) {
          await prisma.slots.update({
            where: { id: existing.id },
            data: updatePayload,
          });
        } else {
          await prisma.slots.create({
            data: {
              casino_id: casinoId,
              geo: geoUpper,
              name: slotData.name,
              provider: slotData.provider ?? null,
              image_url: slotData.image_url ?? null,
              description: slotData.description ?? null,
              features: (slotData.features as any) ?? undefined,
              is_featured: slotData.is_featured ?? false,
              is_new: slotData.is_new ?? false,
              is_popular: slotData.is_popular ?? false,
              parsed_at: new Date(),
            },
          });
        }

        savedCount += 1;
        geoCount += 1;
      }

      summary.push({ geo: geoUpper, count: geoCount });
    }

    return { savedCount, summary };
  },

  async deleteSlot(id: number): Promise<void> {
    await prisma.slots.delete({
      where: { id },
    });
  },
};

