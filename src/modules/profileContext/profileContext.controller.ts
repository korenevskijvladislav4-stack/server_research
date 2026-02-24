import { Request, Response } from 'express';
import { profileContextService } from './profileContext.service';
import { sendError } from '../../common/response';

export async function getAllProfileContexts(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await profileContextService.getAll();
    res.json(rows);
  } catch (e) {
    console.error('getAllProfileContexts error:', e);
    sendError(res, 500, 'Failed to fetch profile contexts');
  }
}

export async function getProfileContextById(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    const row = await profileContextService.getById(id);
    if (!row) {
      sendError(res, 404, 'Profile context not found');
      return;
    }
    res.json(row);
  } catch (e) {
    console.error('getProfileContextById error:', e);
    sendError(res, 500, 'Failed to fetch profile context');
  }
}

export async function createProfileContext(req: Request, res: Response): Promise<void> {
  try {
    const data = req.body ?? {};
    const ctx = await profileContextService.create(data);
    res.status(201).json(ctx);
  } catch (e) {
    console.error('createProfileContext error:', e);
    sendError(res, 500, 'Failed to create profile context');
  }
}

export async function updateProfileContext(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    const data = req.body ?? {};
    if (Object.keys(data).length === 0) {
      sendError(res, 400, 'No fields to update');
      return;
    }
    const updated = await profileContextService.update(id, data);
    res.json(updated);
  } catch (e) {
    console.error('updateProfileContext error:', e);
    sendError(res, 500, 'Failed to update profile context');
  }
}

export async function deleteProfileContext(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    const existing = await profileContextService.getById(id);
    if (!existing) {
      sendError(res, 404, 'Profile context not found');
      return;
    }
    await profileContextService.delete(id);
    res.json({ message: 'Profile context deleted' });
  } catch (e) {
    console.error('deleteProfileContext error:', e);
    sendError(res, 500, 'Failed to delete profile context');
  }
}
