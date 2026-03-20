import { Request, Response } from 'express';
import { AppError } from '../../errors/AppError';
import { emailTopicService } from './emailTopic.service';

export const getEmailTopics = async (_req: Request, res: Response): Promise<void> => {
  const rows = await emailTopicService.getEmailTopics();
  res.json(rows);
};

export const createEmailTopic = async (req: Request, res: Response): Promise<void> => {
  const { name, description, ai_target } = req.body;
  if (!name || !String(name).trim()) {
    throw new AppError(400, 'Название обязательно');
  }
  const at = ai_target != null ? String(ai_target) : 'none';
  if (!['none', 'bonus', 'promo'].includes(at)) {
    throw new AppError(400, 'ai_target: none | bonus | promo');
  }
  const row = await emailTopicService.createEmailTopic({
    name: String(name),
    description: description != null ? String(description) : null,
    ai_target: at as 'none' | 'bonus' | 'promo',
  });
  res.status(201).json(row);
};

export const updateEmailTopic = async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const { name, description, sort_order, ai_target } = req.body;
  if (!id) {
    throw new AppError(400, 'ID темы обязателен');
  }
  let aiTarget: 'none' | 'bonus' | 'promo' | undefined;
  if (ai_target !== undefined && ai_target !== null) {
    const at = String(ai_target);
    if (!['none', 'bonus', 'promo'].includes(at)) {
      throw new AppError(400, 'ai_target: none | bonus | promo');
    }
    aiTarget = at as 'none' | 'bonus' | 'promo';
  }
  const row = await emailTopicService.updateEmailTopic(id, {
    name,
    description,
    sort_order: sort_order != null ? Number(sort_order) : undefined,
    ai_target: aiTarget,
  });
  res.json(row);
};

export const deleteEmailTopic = async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const result = await emailTopicService.deleteEmailTopic(id);
  res.json(result);
};
