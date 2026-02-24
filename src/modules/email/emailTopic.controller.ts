import { Request, Response } from 'express';
import { emailTopicService } from './emailTopic.service';

export const getEmailTopics = async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await emailTopicService.getEmailTopics();
    res.json(rows);
  } catch (error) {
    console.error('Error fetching email topics:', error);
    res.status(500).json({ error: 'Failed to fetch email topics' });
  }
};

export const createEmailTopic = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description } = req.body;
    if (!name || !String(name).trim()) {
      res.status(400).json({ error: 'Название обязательно' });
      return;
    }
    const row = await emailTopicService.createEmailTopic({
      name: String(name),
      description: description != null ? String(description) : null,
    });
    res.status(201).json(row);
  } catch (error) {
    console.error('Error creating email topic:', error);
    res.status(500).json({ error: 'Failed to create email topic' });
  }
};

export const updateEmailTopic = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const { name, description, sort_order } = req.body;
    if (!id) {
      res.status(400).json({ error: 'ID темы обязателен' });
      return;
    }
    const row = await emailTopicService.updateEmailTopic(id, {
      name,
      description,
      sort_order: sort_order != null ? Number(sort_order) : undefined,
    });
    res.json(row);
  } catch (error) {
    console.error('Error updating email topic:', error);
    res.status(500).json({ error: 'Failed to update email topic' });
  }
};

export const deleteEmailTopic = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const result = await emailTopicService.deleteEmailTopic(id);
    res.json(result);
  } catch (error) {
    console.error('Error deleting email topic:', error);
    res.status(500).json({ error: 'Failed to delete email topic' });
  }
};

