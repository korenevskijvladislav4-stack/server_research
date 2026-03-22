import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';

export type LoyaltyStatusInput = { id?: number; name: string; description_md: string };

export type LoyaltyStatusImageDTO = {
  id: number;
  file_path: string;
  original_name: string | null;
  url: string;
};

export type LoyaltyProgramDTO = {
  id: number;
  casino_id: number;
  geo: string;
  orientation: 'casino' | 'sport';
  conditions_md: string;
  created_at: Date | null;
  updated_at: Date | null;
  statuses: Array<{
    id: number;
    name: string;
    description_md: string;
    sort_order: number;
    images: LoyaltyStatusImageDTO[];
  }>;
};

type StatusRow = {
  id: number;
  name: string;
  description_md: string;
  sort_order: number;
  images?: Array<{
    id: number;
    file_path: string;
    original_name: string | null;
    created_at: Date | null;
  }>;
};

function mapImages(
  images: Array<{ id: number; file_path: string; original_name: string | null }> | undefined,
): LoyaltyStatusImageDTO[] {
  return (images ?? []).map((img) => ({
    id: img.id,
    file_path: img.file_path,
    original_name: img.original_name,
    url: `/api/uploads/${img.file_path}`,
  }));
}

function mapProgram(row: {
  id: number;
  casino_id: number;
  geo: string;
  orientation: 'casino' | 'sport';
  conditions_md: string;
  created_at: Date | null;
  updated_at: Date | null;
  statuses: StatusRow[];
}): LoyaltyProgramDTO {
  const statuses = [...row.statuses].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  return {
    id: row.id,
    casino_id: row.casino_id,
    geo: row.geo,
    orientation: row.orientation,
    conditions_md: row.conditions_md,
    created_at: row.created_at,
    updated_at: row.updated_at,
    statuses: statuses.map((s) => ({
      id: s.id,
      name: s.name,
      description_md: s.description_md,
      sort_order: s.sort_order,
      images: mapImages(s.images),
    })),
  };
}

const statusInclude = { images: true as const };

export const casinoLoyaltyService = {
  async listForCasino(casinoId: number, geo?: string | null): Promise<LoyaltyProgramDTO[]> {
    const where: Prisma.casino_loyalty_programsWhereInput = { casino_id: casinoId };
    if (geo?.trim()) where.geo = geo.trim().toUpperCase().slice(0, 10);
    const rows = await prisma.casino_loyalty_programs.findMany({
      where,
      include: {
        statuses: {
          include: statusInclude,
          orderBy: { sort_order: 'asc' },
        },
      },
      orderBy: [{ geo: 'asc' }, { orientation: 'asc' }],
    });
    return rows.map(mapProgram);
  },

  async getById(casinoId: number, programId: number): Promise<LoyaltyProgramDTO | null> {
    const row = await prisma.casino_loyalty_programs.findFirst({
      where: { id: programId, casino_id: casinoId },
      include: {
        statuses: {
          include: statusInclude,
          orderBy: { sort_order: 'asc' },
        },
      },
    });
    return row ? mapProgram(row) : null;
  },

  async create(
    casinoId: number,
    data: {
      geo: string;
      orientation: 'casino' | 'sport';
      conditions_md: string;
      statuses: LoyaltyStatusInput[];
    },
  ): Promise<LoyaltyProgramDTO> {
    const geo = data.geo.trim().toUpperCase().slice(0, 10);
    if (!geo) throw new Error('GEO required');

    const statuses = (data.statuses ?? []).map((s, i) => ({
      name: (s.name || '').trim() || `Status ${i + 1}`,
      description_md: (s.description_md ?? '').trim() || '—',
      sort_order: i,
    }));

    try {
      const row = await prisma.casino_loyalty_programs.create({
        data: {
          casino_id: casinoId,
          geo,
          orientation: data.orientation,
          conditions_md: (data.conditions_md ?? '').trim() || '—',
          statuses: { create: statuses },
        },
        include: {
          statuses: {
            include: statusInclude,
            orderBy: { sort_order: 'asc' },
          },
        },
      });
      return mapProgram(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const err = new Error('Program already exists for this GEO and orientation');
        (err as Error & { statusCode?: number }).statusCode = 409;
        throw err;
      }
      throw e;
    }
  },

  async update(
    casinoId: number,
    programId: number,
    data: {
      geo?: string;
      orientation?: 'casino' | 'sport';
      conditions_md?: string;
      statuses?: LoyaltyStatusInput[];
    },
  ): Promise<LoyaltyProgramDTO | null> {
    const existing = await prisma.casino_loyalty_programs.findFirst({
      where: { id: programId, casino_id: casinoId },
    });
    if (!existing) return null;

    const geo =
      data.geo !== undefined
        ? data.geo.trim().toUpperCase().slice(0, 10)
        : existing.geo;
    if (!geo) throw new Error('GEO required');

    const orientation = data.orientation ?? existing.orientation;
    const conditions_md =
      data.conditions_md !== undefined
        ? (data.conditions_md ?? '').trim() || '—'
        : existing.conditions_md;

    const newStatuses = data.statuses;

    try {
      await prisma.$transaction(async (tx) => {
        if (newStatuses !== undefined) {
          const existingRows = await tx.casino_loyalty_statuses.findMany({
            where: { program_id: programId },
          });
          const payloadIds = new Set(
            newStatuses
              .map((s) => s.id)
              .filter((id): id is number => typeof id === 'number' && id > 0),
          );

          for (const row of existingRows) {
            if (!payloadIds.has(row.id)) {
              await tx.casino_loyalty_statuses.delete({ where: { id: row.id } });
            }
          }

          for (let i = 0; i < newStatuses.length; i++) {
            const row = newStatuses[i];
            const name = (row.name || '').trim() || `Status ${i + 1}`;
            const description_md = (row.description_md ?? '').trim() || '—';
            const sid = row.id;

            if (sid && sid > 0) {
              const found = await tx.casino_loyalty_statuses.findFirst({
                where: { id: sid, program_id: programId },
              });
              if (found) {
                await tx.casino_loyalty_statuses.update({
                  where: { id: sid },
                  data: { name, description_md, sort_order: i },
                });
                continue;
              }
            }

            await tx.casino_loyalty_statuses.create({
              data: {
                program_id: programId,
                name,
                description_md,
                sort_order: i,
              },
            });
          }
        }

        await tx.casino_loyalty_programs.update({
          where: { id: programId },
          data: { geo, orientation, conditions_md },
        });
      });

      return this.getById(casinoId, programId);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const err = new Error('Program already exists for this GEO and orientation');
        (err as Error & { statusCode?: number }).statusCode = 409;
        throw err;
      }
      throw e;
    }
  },

  async delete(casinoId: number, programId: number): Promise<boolean> {
    const r = await prisma.casino_loyalty_programs.deleteMany({
      where: { id: programId, casino_id: casinoId },
    });
    return r.count > 0;
  },

  async assertStatusInProgram(casinoId: number, programId: number, statusId: number) {
    const st = await prisma.casino_loyalty_statuses.findFirst({
      where: {
        id: statusId,
        program_id: programId,
        program: { casino_id: casinoId },
      },
    });
    return st;
  },

  async addStatusImage(
    casinoId: number,
    statusId: number,
    relativePath: string,
    originalName?: string,
  ) {
    return prisma.casino_loyalty_status_images.create({
      data: {
        casino_id: casinoId,
        status_id: statusId,
        file_path: relativePath,
        original_name: originalName ?? null,
      },
    });
  },

  async getStatusImages(statusId: number) {
    return prisma.casino_loyalty_status_images.findMany({
      where: { status_id: statusId },
      orderBy: { id: 'asc' },
    });
  },

  async getStatusImageById(imageId: number) {
    return prisma.casino_loyalty_status_images.findUnique({ where: { id: imageId } });
  },

  async deleteStatusImage(imageId: number) {
    return prisma.casino_loyalty_status_images.delete({ where: { id: imageId } });
  },
};
