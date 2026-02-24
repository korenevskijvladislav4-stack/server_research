import { Request, Response } from 'express';
import { profileFieldService } from './profileField.service';
import { sendError } from '../../common/response';

export async function getAllProfileFields(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await profileFieldService.getAll();
    res.json(rows);
  } catch (e) {
    console.error('getAllProfileFields error:', e);
    sendError(res, 500, 'Failed to fetch profile fields');
  }
}

export async function getProfileFieldById(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    const row = await profileFieldService.getById(id);
    if (!row) {
      sendError(res, 404, 'Profile field not found');
      return;
    }
    res.json(row);
  } catch (e) {
    console.error('getProfileFieldById error:', e);
    sendError(res, 500, 'Failed to fetch profile field');
  }
}

export async function createProfileField(req: Request, res: Response): Promise<void> {
  try {
    const data = req.body ?? {};
    const field = await profileFieldService.create(data);
    res.status(201).json(field);
  } catch (e) {
    console.error('createProfileField error:', e);
    sendError(res, 500, 'Failed to create profile field');
  }
}

export async function updateProfileField(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    const data = req.body ?? {};
    if (Object.keys(data).length === 0) {
      sendError(res, 400, 'No fields to update');
      return;
    }
    const updated = await profileFieldService.update(id, data);
    res.json(updated);
  } catch (e) {
    console.error('updateProfileField error:', e);
    sendError(res, 500, 'Failed to update profile field');
  }
}

export async function deleteProfileField(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    const existing = await profileFieldService.getById(id);
    if (!existing) {
      sendError(res, 404, 'Profile field not found');
      return;
    }
    await profileFieldService.delete(id);
    res.json({ message: 'Profile field deleted' });
  } catch (e) {
    console.error('deleteProfileField error:', e);
    sendError(res, 500, 'Failed to delete profile field');
  }
}
