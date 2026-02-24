import { Request, Response } from 'express';
import { tagService } from './tag.service';
import { sendError } from '../../common/response';

export async function listTags(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await tagService.list();
    res.json(rows);
  } catch (e) {
    console.error('listTags:', e);
    sendError(res, 500, 'Failed to list tags');
  }
}

export async function createTag(req: Request, res: Response): Promise<void> {
  try {
    const { name, color } = req.body as { name?: string; color?: string };
    if (!name || !String(name).trim()) {
      sendError(res, 400, 'name is required');
      return;
    }
    const tag = await tagService.create(String(name).trim(), color);
    res.status(201).json(tag);
  } catch (e: any) {
    if (e?.code === 'P2002') {
      sendError(res, 409, 'Тег с таким именем уже существует');
      return;
    }
    console.error('createTag:', e);
    sendError(res, 500, 'Failed to create tag');
  }
}

export async function deleteTag(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'Invalid tag id');
      return;
    }
    const ok = await tagService.delete(id);
    if (!ok) {
      sendError(res, 404, 'Tag not found');
      return;
    }
    res.json({ message: 'Tag deleted' });
  } catch (e) {
    console.error('deleteTag:', e);
    sendError(res, 500, 'Failed to delete tag');
  }
}

export async function getCasinoTags(req: Request, res: Response): Promise<void> {
  try {
    const casinoId = parseInt(req.params.casinoId, 10);
    if (isNaN(casinoId)) {
      sendError(res, 400, 'Invalid casino id');
      return;
    }
    const rows = await tagService.getByCasinoId(casinoId);
    res.json(rows);
  } catch (e) {
    console.error('getCasinoTags:', e);
    sendError(res, 500, 'Failed to get casino tags');
  }
}

export async function setCasinoTags(req: Request, res: Response): Promise<void> {
  try {
    const casinoId = parseInt(req.params.casinoId, 10);
    const { tagIds } = req.body as { tagIds?: number[] };
    if (isNaN(casinoId)) {
      sendError(res, 400, 'Invalid casino id');
      return;
    }
    if (!Array.isArray(tagIds)) {
      sendError(res, 400, 'tagIds must be an array');
      return;
    }
    const ids = tagIds.map((id) => Number(id)).filter((id) => !isNaN(id));
    const rows = await tagService.setForCasino(casinoId, ids);
    res.json(rows);
  } catch (e) {
    console.error('setCasinoTags:', e);
    sendError(res, 500, 'Failed to set casino tags');
  }
}

export async function getAllCasinoTags(_req: Request, res: Response): Promise<void> {
  try {
    const map = await tagService.getAllCasinoTags();
    res.json(map);
  } catch (e) {
    console.error('getAllCasinoTags:', e);
    sendError(res, 500, 'Failed to get all casino tags');
  }
}
