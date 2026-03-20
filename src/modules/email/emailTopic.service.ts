import prisma from '../../lib/prisma';

export const emailTopicService = {
  async getEmailTopics() {
    return prisma.email_topics.findMany({
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    });
  },

  async createEmailTopic(data: {
    name: string;
    description?: string | null;
    ai_target?: 'none' | 'bonus' | 'promo';
  }) {
    const nameTrim = data.name.trim();
    if (!nameTrim) {
      throw new Error('Название обязательно');
    }

    const agg = await prisma.email_topics.aggregate({
      _max: { sort_order: true },
    });
    const nextOrder = (agg._max.sort_order ?? 0) + 1;

    const aiTarget = data.ai_target ?? 'none';

    const row = await prisma.email_topics.create({
      data: {
        name: nameTrim,
        description: data.description ? data.description.trim() : null,
        sort_order: nextOrder,
        ai_target: aiTarget,
      },
    });

    return row;
  },

  async updateEmailTopic(
    id: number,
    data: {
      name?: string;
      description?: string | null;
      sort_order?: number;
      ai_target?: 'none' | 'bonus' | 'promo';
    },
  ) {
    const updateData: any = {};
    if (data.name !== undefined) {
      updateData.name = data.name.trim();
    }
    if (data.description !== undefined) {
      updateData.description = data.description ? data.description.trim() : null;
    }
    if (data.sort_order !== undefined) {
      updateData.sort_order = data.sort_order;
    }
    if (data.ai_target !== undefined) {
      updateData.ai_target = data.ai_target;
    }

    if (Object.keys(updateData).length === 0) {
      return prisma.email_topics.findUnique({ where: { id } });
    }

    return prisma.email_topics.update({
      where: { id },
      data: updateData,
    });
  },

  async deleteEmailTopic(id: number) {
    await prisma.emails.updateMany({
      where: { topic_id: id },
      data: { topic_id: null },
    });
    await prisma.email_topics.delete({
      where: { id },
    });
    return { ok: true };
  },
};

