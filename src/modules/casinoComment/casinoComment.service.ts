import prisma from '../../lib/prisma';

export const casinoCommentService = {
  async getByCasino(casinoId: number) {
    return prisma.casino_comments.findMany({
      where: { casino_id: casinoId },
      include: { users: { select: { username: true } } },
      orderBy: { created_at: 'desc' },
    });
  },

  async create(casinoId: number, text: string, userId: number) {
    return prisma.casino_comments.create({
      data: { casino_id: casinoId, user_id: userId, text },
      include: { users: { select: { username: true } } },
    });
  },

  async getById(id: number) {
    return prisma.casino_comments.findUnique({
      where: { id },
      include: { users: { select: { username: true } } },
    });
  },

  async update(id: number, text: string) {
    return prisma.casino_comments.update({
      where: { id },
      data: { text },
      include: { users: { select: { username: true } } },
    });
  },

  async delete(id: number) {
    return prisma.casino_comments.delete({ where: { id } });
  },

  async addImage(casinoId: number, commentId: number | null, filePath: string, originalName?: string) {
    return prisma.casino_comment_images.create({
      data: { casino_id: casinoId, comment_id: commentId, file_path: filePath, original_name: originalName ?? null },
    });
  },

  async getCasinoImages(casinoId: number) {
    const [commentImg, bonusImg, paymentImg, promoImg] = await Promise.all([
      prisma.casino_comment_images.findMany({
        where: { casino_id: casinoId },
        include: { casino_comments: { select: { text: true } } },
        orderBy: { created_at: 'desc' },
      }),
      prisma.casino_bonus_images.findMany({
        where: { casino_id: casinoId },
        include: { casino_bonuses: { select: { name: true } } },
        orderBy: { created_at: 'desc' },
      }),
      prisma.casino_payment_images.findMany({
        where: { casino_id: casinoId },
        include: { casino_payments: { select: { type: true, method: true } } },
        orderBy: { created_at: 'desc' },
      }),
      prisma.casino_promo_images.findMany({
        where: { casino_id: casinoId },
        include: { casino_promos: { select: { name: true } } },
        orderBy: { created_at: 'desc' },
      }),
    ]);
    const commentRows = commentImg.map((i) => ({
      ...i,
      url: `/api/uploads/${i.file_path}`,
      entity_type: 'comment',
      label: i.casino_comments?.text ? `Комментарий: ${i.casino_comments.text.substring(0, 50)}...` : 'Комментарий',
    }));
    const bonusRows = bonusImg.map((i) => ({
      ...i,
      url: `/api/uploads/${i.file_path}`,
      entity_type: 'bonus',
      label: (i as any).casino_bonuses?.name ? `Бонус: ${(i as any).casino_bonuses.name}` : 'Бонус',
    }));
    const paymentRows = paymentImg.map((i) => ({
      ...i,
      url: `/api/uploads/${i.file_path}`,
      entity_type: 'payment',
      label: (i as any).casino_payments ? `Платеж: ${(i as any).casino_payments.type} - ${(i as any).casino_payments.method}` : 'Платеж',
    }));
    const promoRows = promoImg.map((i) => ({
      ...i,
      url: `/api/uploads/${i.file_path}`,
      entity_type: 'promo',
      label: (i as any).casino_promos?.name ? `Промо: ${(i as any).casino_promos.name}` : 'Промо',
    }));
    const all = [...commentRows, ...bonusRows, ...paymentRows, ...promoRows];
    all.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    return all;
  },
};
