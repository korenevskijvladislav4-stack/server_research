import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { chatService } from './chat.service';
import { getChatModelsForClient } from './chatModel.service';
import { AppError } from '../../errors/AppError';

export async function getChatConfig(_req: AuthRequest, res: Response): Promise<void> {
  res.json(await getChatModelsForClient());
}

export async function listChats(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, 'Необходима авторизация');
  }
  const sessions = await chatService.listSessions(userId);
  res.json(sessions);
}

export async function createChat(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, 'Необходима авторизация');
  }
  const title = (req.body?.title as string) || null;
  const session = await chatService.createSession(userId, title);
  res.status(201).json(session);
}

export async function getChat(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, 'Необходима авторизация');
  }
  const sessionId = Number(req.params.sessionId);
  if (!sessionId) {
    throw new AppError(400, 'Некорректный ID сессии');
  }
  const session = await chatService.getSessionWithMessages(sessionId, userId);
  if (!session) {
    throw new AppError(404, 'Чат не найден');
  }
  res.json(session);
}

export async function deleteChat(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, 'Необходима авторизация');
  }
  const sessionId = Number(req.params.sessionId);
  if (!sessionId) {
    throw new AppError(400, 'Некорректный ID сессии');
  }
  await chatService.deleteSession(sessionId, userId);
  res.json({ ok: true });
}

export async function sendMessage(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, 'Необходима авторизация');
  }
  const sessionId = Number(req.params.sessionId);
  if (!sessionId) {
    throw new AppError(400, 'Некорректный ID сессии');
  }
  const content = req.body?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new AppError(400, 'Текст сообщения обязателен');
  }
  const model = typeof req.body?.model === 'string' ? req.body.model : undefined;
  const result = await chatService.addMessageAndReply(sessionId, userId, content.trim(), model);
  res.status(201).json(result);
}

export async function sendMessageStream(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, 'Необходима авторизация');
  }
  const sessionId = Number(req.params.sessionId);
  if (!sessionId) {
    throw new AppError(400, 'Некорректный ID сессии');
  }
  const content = req.body?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new AppError(400, 'Текст сообщения обязателен');
  }
  const model = typeof req.body?.model === 'string' ? req.body.model : undefined;

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  await chatService.addMessageAndReplyStream(sessionId, userId, content.trim(), model, (evt) => {
    res.write(`${JSON.stringify(evt)}\n`);
  });

  res.end();
}
