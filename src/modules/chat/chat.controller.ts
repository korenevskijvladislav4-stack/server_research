import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { chatService } from './chat.service';
import { sendError } from '../../common/response';

export async function listChats(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      sendError(res, 401, 'Unauthorized');
      return;
    }
    const sessions = await chatService.listSessions(userId);
    res.json(sessions);
  } catch (e: unknown) {
    const err = e as Error;
    console.error('listChats error:', err?.message ?? e);
    sendError(res, 500, 'Failed to list chats');
  }
}

export async function createChat(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      sendError(res, 401, 'Unauthorized');
      return;
    }
    const title = (req.body?.title as string) || null;
    const session = await chatService.createSession(userId, title);
    res.status(201).json(session);
  } catch (e: unknown) {
    const err = e as Error;
    console.error('createChat error:', err?.message ?? e);
    sendError(res, 500, 'Failed to create chat');
  }
}

export async function getChat(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      sendError(res, 401, 'Unauthorized');
      return;
    }
    const sessionId = Number(req.params.sessionId);
    if (!sessionId) {
      sendError(res, 400, 'Invalid sessionId');
      return;
    }
    const session = await chatService.getSessionWithMessages(sessionId, userId);
    if (!session) {
      sendError(res, 404, 'Chat not found');
      return;
    }
    res.json(session);
  } catch (e: unknown) {
    const err = e as Error;
    console.error('getChat error:', err?.message ?? e);
    sendError(res, 500, 'Failed to load chat');
  }
}

export async function deleteChat(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      sendError(res, 401, 'Unauthorized');
      return;
    }
    const sessionId = Number(req.params.sessionId);
    if (!sessionId) {
      sendError(res, 400, 'Invalid sessionId');
      return;
    }
    await chatService.deleteSession(sessionId, userId);
    res.json({ ok: true });
  } catch (e: unknown) {
    const err = e as Error;
    console.error('deleteChat error:', err?.message ?? e);
    sendError(res, 500, 'Failed to delete chat');
  }
}

export async function sendMessage(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      sendError(res, 401, 'Unauthorized');
      return;
    }
    const sessionId = Number(req.params.sessionId);
    if (!sessionId) {
      sendError(res, 400, 'Invalid sessionId');
      return;
    }
    const content = req.body?.content;
    if (typeof content !== 'string' || !content.trim()) {
      sendError(res, 400, 'content is required');
      return;
    }
    const result = await chatService.addMessageAndReply(sessionId, userId, content.trim());
    res.status(201).json(result);
  } catch (e: unknown) {
    const err = e as Error;
    console.error('sendMessage error:', err?.message ?? e);
    sendError(res, 500, err?.message ?? 'Failed to send message');
  }
}

export async function sendMessageStream(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      sendError(res, 401, 'Unauthorized');
      return;
    }
    const sessionId = Number(req.params.sessionId);
    if (!sessionId) {
      sendError(res, 400, 'Invalid sessionId');
      return;
    }
    const content = req.body?.content;
    if (typeof content !== 'string' || !content.trim()) {
      sendError(res, 400, 'content is required');
      return;
    }

    // Подготавливаем ответ для стриминга текста (chunked transfer).
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    await chatService.addMessageAndReplyStream(sessionId, userId, content.trim(), (chunk) => {
      res.write(chunk);
    });

    res.end();
  } catch (e: unknown) {
    const err = e as Error;
    console.error('sendMessageStream error:', err?.message ?? e);
    if (!res.headersSent) {
      sendError(res, 500, err?.message ?? 'Failed to send message (stream)');
    } else {
      try {
        res.end();
      } catch {
        // ignore
      }
    }
  }
}
