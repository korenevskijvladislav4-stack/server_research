import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { casinoCommentService } from './casinoComment.service';
import { AppError } from '../../errors/AppError';
import { AuthRequest } from '../../middleware/auth.middleware';

const uploadsRoot = path.join(__dirname, '..', '..', '..', 'uploads');

function toCommentRow(c: any) {
  return { ...c, username: c.users?.username ?? null, users: undefined };
}

export async function getCommentsByCasino(req: Request, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const list = await casinoCommentService.getByCasino(casinoId);
  res.json(list.map(toCommentRow));
}

export async function createComment(req: AuthRequest, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(401, 'Необходима авторизация');
  }
  const text = req.body?.text?.trim();
  if (!text) {
    throw new AppError(400, 'Текст комментария обязателен');
  }
  const comment = await casinoCommentService.create(casinoId, text, userId);
  res.status(201).json(toCommentRow(comment));
}

export async function updateComment(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const text = req.body?.text?.trim();
  if (!text) {
    throw new AppError(400, 'Текст комментария обязателен');
  }
  const existing = await casinoCommentService.getById(id);
  if (!existing) {
    throw new AppError(404, 'Комментарий не найден');
  }
  if (existing.user_id !== req.user?.id) {
    throw new AppError(403, 'Можно редактировать только свои комментарии');
  }
  const updated = await casinoCommentService.update(id, text);
  res.json(toCommentRow(updated));
}

export async function deleteComment(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const existing = await casinoCommentService.getById(id);
  if (!existing) {
    throw new AppError(404, 'Комментарий не найден');
  }
  if (existing.user_id !== req.user?.id) {
    throw new AppError(403, 'Можно удалять только свои комментарии');
  }
  await casinoCommentService.delete(id);
  res.json({ message: 'Comment deleted successfully' });
}

export async function uploadCommentImage(req: Request, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const commentId = req.params.commentId ? Number(req.params.commentId) : null;
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) {
    throw new AppError(400, 'Файл не загружен');
  }
  const relativePath = path.join('comments', path.basename(file.path)).replace(/\\/g, '/');
  const img = await casinoCommentService.addImage(casinoId, commentId, relativePath, file.originalname);
  res.status(201).json({ ...img, url: `/api/uploads/${img.file_path}` });
}

export async function getCasinoImages(req: Request, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  let all = await casinoCommentService.getCasinoImages(casinoId);
  all = all.filter((img: any) => fs.existsSync(path.join(uploadsRoot, img.file_path)));
  res.json(all);
}
