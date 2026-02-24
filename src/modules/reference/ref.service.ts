import prisma from '../../lib/prisma';

const byName = (name: string) => name.trim();

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
  },
};
