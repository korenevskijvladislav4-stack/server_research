import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { casinoCommentService } from './casinoComment.service';
import { sendError } from '../../common/response';
import { AuthRequest } from '../../middleware/auth.middleware';

const uploadsRoot = path.join(__dirname, '..', '..', '..', 'uploads');

function toCommentRow(c: any) {
  return { ...c, username: c.users?.username ?? null, users: undefined };
}

export async function getCommentsByCasino(req: Request, res: Response): Promise<void> {
  try {
    const casinoId = Number(req.params.casinoId);
    const list = await casinoCommentService.getByCasino(casinoId);
    res.json(list.map(toCommentRow));
  } catch (e) {
    console.error('getCommentsByCasino error:', e);
    sendError(res, 500, 'Failed to fetch comments');
  }
}

export async function createComment(req: AuthRequest, res: Response): Promise<void> {
  try {
    const casinoId = Number(req.params.casinoId);
    const userId = req.user?.id;
    if (!userId) {
      sendError(res, 401, 'User not authenticated');
      return;
    }
    const text = req.body?.text?.trim();
    if (!text) {
      sendError(res, 400, 'Comment text is required');
      return;
    }
    const comment = await casinoCommentService.create(casinoId, text, userId);
    res.status(201).json(toCommentRow(comment));
  } catch (e) {
    console.error('createComment error:', e);
    sendError(res, 500, 'Failed to create comment');
  }
}

export async function updateComment(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    const text = req.body?.text?.trim();
    if (!text) {
      sendError(res, 400, 'Comment text is required');
      return;
    }
    const existing = await casinoCommentService.getById(id);
    if (!existing) {
      sendError(res, 404, 'Comment not found');
      return;
    }
    if (existing.user_id !== req.user?.id) {
      sendError(res, 403, 'You can only edit your own comments');
      return;
    }
    const updated = await casinoCommentService.update(id, text);
    res.json(toCommentRow(updated));
  } catch (e) {
    console.error('updateComment error:', e);
    sendError(res, 500, 'Failed to update comment');
  }
}

export async function deleteComment(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    const existing = await casinoCommentService.getById(id);
    if (!existing) {
      sendError(res, 404, 'Comment not found');
      return;
    }
    if (existing.user_id !== req.user?.id) {
      sendError(res, 403, 'You can only delete your own comments');
      return;
    }
    await casinoCommentService.delete(id);
    res.json({ message: 'Comment deleted successfully' });
  } catch (e) {
    console.error('deleteComment error:', e);
    sendError(res, 500, 'Failed to delete comment');
  }
}

export async function uploadCommentImage(req: Request, res: Response): Promise<void> {
  try {
    const casinoId = Number(req.params.casinoId);
    const commentId = req.params.commentId ? Number(req.params.commentId) : null;
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      sendError(res, 400, 'No file provided');
      return;
    }
    const relativePath = path.join('comments', path.basename(file.path)).replace(/\\/g, '/');
    const img = await casinoCommentService.addImage(casinoId, commentId, relativePath, file.originalname);
    res.status(201).json({ ...img, url: `/api/uploads/${img.file_path}` });
  } catch (e) {
    console.error('uploadCommentImage error:', e);
    sendError(res, 500, 'Failed to save image');
  }
}

export async function getCasinoImages(req: Request, res: Response): Promise<void> {
  try {
    const casinoId = Number(req.params.casinoId);
    let all = await casinoCommentService.getCasinoImages(casinoId);
    all = all.filter((img: any) => fs.existsSync(path.join(uploadsRoot, img.file_path)));
    res.json(all);
  } catch (e) {
    console.error('getCasinoImages error:', e);
    sendError(res, 500, 'Failed to fetch images');
  }
}
