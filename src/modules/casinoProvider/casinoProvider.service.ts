import prisma from '../../lib/prisma';
import { Prisma } from '@prisma/client';
import { extractProviderNamesFromText } from '../../services/ai-summary.service';

export interface CasinoProviderWithName {
  id: number;
  casino_id: number;
  provider_id: number;
  geo: string;
  created_at: Date | null;
  provider_name: string | null;
}

export interface ProviderAnalyticsFilters {
  geos?: string[];
  casino_ids?: number[];
  provider_ids?: number[];
}

export interface ProviderAnalyticsResult {
  casinos: { id: number; name: string }[];
  providers: { id: number; name: string }[];
  connections: { casino_id: number; provider_id: number }[];
}

export const casinoProviderService = {
  async listCasinoProviders(casinoId: number, geo?: string): Promise<CasinoProviderWithName[]> {
    const where: Prisma.casino_providersWhereInput = {
      casino_id: casinoId,
      ...(geo ? { geo } : {}),
    };

    const rows = await prisma.casino_providers.findMany({
      where,
      include: {
        providers: {
          select: { name: true },
        },
      },
      orderBy: {
        providers: {
          name: 'asc',
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      casino_id: row.casino_id,
      provider_id: row.provider_id,
      geo: row.geo,
      created_at: row.created_at,
      provider_name: row.providers?.name ?? null,
    }));
  },

  async addProviderToCasino(
    casinoId: number,
    payload: { provider_id?: number; provider_name?: string; geo: string },
  ): Promise<{ providerId: number | null; created: CasinoProviderWithName | null }> {
    const geoTrim = (typeof payload.geo === 'string' ? payload.geo : '').trim();
    if (!geoTrim) {
      return { providerId: null, created: null };
    }

    let providerId: number | null = null;

    if (payload.provider_id) {
      const existingById = await prisma.providers.findUnique({
        where: { id: payload.provider_id },
        select: { id: true },
      });
      if (existingById) {
        providerId = existingById.id;
      }
    }

    if (providerId == null && payload.provider_name && String(payload.provider_name).trim()) {
      const nameTrim = String(payload.provider_name).trim();
      const existingByName = await prisma.providers.findUnique({
        where: { name: nameTrim },
        select: { id: true },
      });
      if (existingByName) {
        providerId = existingByName.id;
      } else {
        const createdProvider = await prisma.providers.create({
          data: { name: nameTrim },
        });
        providerId = createdProvider.id;
      }
    }

    if (providerId == null) {
      return { providerId: null, created: null };
    }

    await prisma.casino_providers.upsert({
      where: {
        casino_id_provider_id_geo: {
          casino_id: casinoId,
          provider_id: providerId,
          geo: geoTrim,
        },
      },
      create: {
        casino_id: casinoId,
        provider_id: providerId,
        geo: geoTrim,
      },
      update: {},
    });

    const createdRow = await prisma.casino_providers.findUnique({
      where: {
        casino_id_provider_id_geo: {
          casino_id: casinoId,
          provider_id: providerId,
          geo: geoTrim,
        },
      },
      include: {
        providers: {
          select: { name: true },
        },
      },
    });

    if (!createdRow) {
      return {
        providerId,
        created: null,
      };
    }

    const created: CasinoProviderWithName = {
      id: createdRow.id,
      casino_id: createdRow.casino_id,
      provider_id: createdRow.provider_id,
      geo: createdRow.geo,
      created_at: createdRow.created_at,
      provider_name: createdRow.providers?.name ?? null,
    };

    return { providerId, created };
  },

  async removeProviderFromCasino(
    casinoId: number,
    providerId: number,
    geo?: string,
  ): Promise<void> {
    const where: Prisma.casino_providersWhereInput = {
      casino_id: casinoId,
      provider_id: providerId,
      ...(geo ? { geo } : {}),
    };

    await prisma.casino_providers.deleteMany({ where });
  },

  async getProviderAnalytics(filters: ProviderAnalyticsFilters): Promise<ProviderAnalyticsResult> {
    const geos = (filters.geos ?? []).filter((g) => !!g && g.trim()).map((g) => g.trim());
    const casinoIds = (filters.casino_ids ?? []).filter((id) => Number.isFinite(id) && id > 0);
    const providerIds = (filters.provider_ids ?? []).filter((id) => Number.isFinite(id) && id > 0);

    const casinoWhere: Prisma.casinosWhereInput = {};
    if (casinoIds.length > 0) {
      casinoWhere.id = { in: casinoIds };
    }
    if (geos.length > 0) {
      casinoWhere.OR = geos.map((g) => ({
        geo: {
          array_contains: g as any,
        } as any,
      }));
    }

    const casinos = await prisma.casinos.findMany({
      where: casinoWhere,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
      },
    });

    const providerWhere: Prisma.providersWhereInput = {};
    if (providerIds.length > 0) {
      providerWhere.id = { in: providerIds };
    }

    const providers = await prisma.providers.findMany({
      where: providerWhere,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
      },
    });

    if (casinos.length === 0 || providers.length === 0) {
      return { casinos, providers, connections: [] };
    }

    const cIds = casinos.map((c) => c.id);
    const pIds = providers.map((p) => p.id);

    const connectionWhere: Prisma.casino_providersWhereInput = {
      casino_id: { in: cIds },
      provider_id: { in: pIds },
    };
    if (geos.length > 0) {
      connectionWhere.geo = { in: geos };
    }

    const connectionsRaw = await prisma.casino_providers.findMany({
      where: connectionWhere,
      select: {
        casino_id: true,
        provider_id: true,
      },
    });

    const connections = connectionsRaw.map((c) => ({
      casino_id: c.casino_id,
      provider_id: c.provider_id,
    }));

    return { casinos, providers, connections };
  },

  async extractAndAddProviders(
    casinoId: number,
    geo: string,
    text: string,
    existingNames?: string[],
  ): Promise<{ names: string[]; added: number }> {
    const geoTrim = (typeof geo === 'string' ? geo : '').trim();
    if (!geoTrim || !text || typeof text !== 'string') {
      return { names: [], added: 0 };
    }

    const currentNames =
      existingNames ??
      (
        await prisma.providers.findMany({
          select: { name: true },
          orderBy: { name: 'asc' },
        })
      ).map((p) => p.name);

    const names = await extractProviderNamesFromText(text, currentNames);
    if (!names.length) {
      return { names: [], added: 0 };
    }

    let added = 0;

    for (const rawName of names) {
      const nameTrim = rawName.trim();
      if (!nameTrim) continue;

      let providerId: number;

      const existing = await prisma.providers.findUnique({
        where: { name: nameTrim },
        select: { id: true },
      });

      if (existing) {
        providerId = existing.id;
      } else {
        const created = await prisma.providers.create({
          data: { name: nameTrim },
        });
        providerId = created.id;
      }

      const existingConnection = await prisma.casino_providers.findUnique({
        where: {
          casino_id_provider_id_geo: {
            casino_id: casinoId,
            provider_id: providerId,
            geo: geoTrim,
          },
        },
        select: { id: true },
      });

      if (!existingConnection) {
        await prisma.casino_providers.create({
          data: {
            casino_id: casinoId,
            provider_id: providerId,
            geo: geoTrim,
          },
        });
        added += 1;
      }
    }

    return { names, added };
  },
};

