import prisma from '../../lib/prisma';
import { AppError } from '../../errors/AppError';

const byName = (name: string) => name.trim();

async function safeDelete(
  run: () => Promise<unknown>,
  notFoundMessage: string,
): Promise<void> {
  try {
    await run();
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === 'P2025') throw new AppError(404, notFoundMessage);
    throw e;
  }
}

export const refService = {
  bonusNames: {
    async list() {
      return prisma.ref_bonus_names.findMany({ orderBy: { name: 'asc' } });
    },
    async create(name: string) {
      const n = byName(name);
      const existing = await prisma.ref_bonus_names.findUnique({ where: { name: n } });
      if (existing) return { item: existing, isNew: false };
      const created = await prisma.ref_bonus_names.create({ data: { name: n } });
      return { item: created, isNew: true };
    },
    async deleteById(id: number) {
      await safeDelete(() => prisma.ref_bonus_names.delete({ where: { id } }), 'Запись не найдена');
    },
  },
  paymentTypes: {
    async list() {
      return prisma.ref_payment_types.findMany({ orderBy: { name: 'asc' } });
    },
    async create(name: string) {
      const n = byName(name);
      const existing = await prisma.ref_payment_types.findUnique({ where: { name: n } });
      if (existing) return { item: existing, isNew: false };
      const created = await prisma.ref_payment_types.create({ data: { name: n } });
      return { item: created, isNew: true };
    },
    async deleteById(id: number) {
      await safeDelete(() => prisma.ref_payment_types.delete({ where: { id } }), 'Запись не найдена');
    },
  },
  paymentMethods: {
    async list() {
      return prisma.ref_payment_methods.findMany({ orderBy: { name: 'asc' } });
    },
    async create(name: string) {
      const n = byName(name);
      const existing = await prisma.ref_payment_methods.findUnique({ where: { name: n } });
      if (existing) return { item: existing, isNew: false };
      const created = await prisma.ref_payment_methods.create({ data: { name: n } });
      return { item: created, isNew: true };
    },
    async deleteById(id: number) {
      await safeDelete(() => prisma.ref_payment_methods.delete({ where: { id } }), 'Запись не найдена');
    },
  },
  promoTypes: {
    async list() {
      return prisma.ref_promo_types.findMany({ orderBy: { name: 'asc' } });
    },
    async create(name: string) {
      const n = byName(name);
      const existing = await prisma.ref_promo_types.findUnique({ where: { name: n } });
      if (existing) return { item: existing, isNew: false };
      const created = await prisma.ref_promo_types.create({ data: { name: n } });
      return { item: created, isNew: true };
    },
    async deleteById(id: number) {
      await safeDelete(() => prisma.ref_promo_types.delete({ where: { id } }), 'Запись не найдена');
    },
  },
  providers: {
    async list() {
      return prisma.providers.findMany({ orderBy: { name: 'asc' } });
    },
    async create(name: string) {
      const n = byName(name);
      const existing = await prisma.providers.findUnique({ where: { name: n } });
      if (existing) return { item: existing, isNew: false };
      const created = await prisma.providers.create({ data: { name: n } });
      return { item: created, isNew: true };
    },
    async deleteById(id: number) {
      await safeDelete(() => prisma.providers.delete({ where: { id } }), 'Провайдер не найден');
    },
  },
};
