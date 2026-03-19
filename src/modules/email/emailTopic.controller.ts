import { Request, Response } from 'express';
import { AppError } from '../../errors/AppError';
import { emailTopicService } from './emailTopic.service';

export const getEmailTopics = async (_req: Request, res: Response): Promise<void> => {
  const rows = await emailTopicService.getEmailTopics();
  res.json(rows);
};

export const createEmailTopic = async (req: Request, res: Response): Promise<void> => {
  const { name, description } = req.body;
  if (!name || !String(name).trim()) {
    throw new AppError(400, 'Название обязательно');
  }
  const row = await emailTopicService.createEmailTopic({
    name: String(name),
    description: description != null ? String(description) : null,
  });
  res.status(201).json(row);
};

export const updateEmailTopic = async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const { name, description, sort_order } = req.body;
  if (!id) {
    throw new AppError(400, 'ID темы обязателен');
  }
  const row = await emailTopicService.updateEmailTopic(id, {
    name,
    description,
    sort_order: sort_order != null ? Number(sort_order) : undefined,
  });
  res.json(row);
};

export const deleteEmailTopic = async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const result = await emailTopicService.deleteEmailTopic(id);
  res.json(result);
};
