import { Request, Response } from 'express';
import { casinoProfileService } from './casinoProfile.service';
import { sendError } from '../../common/response';
import { AuthRequest } from '../../middleware/auth.middleware';

export async function listProfileFields(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await casinoProfileService.listFields();
    res.json(rows);
  } catch (e) {
    console.error('listProfileFields error:', e);
    sendError(res, 500, 'Failed to list profile fields');
  }
}

export async function createProfileField(req: AuthRequest, res: Response): Promise<void> {
  try {
    const actorId = req.user?.id ?? null;
    const body = req.body ?? {};
    if (!body.key_name || !body.label || !body.field_type) {
      sendError(res, 400, 'key_name, label, field_type are required');
      return;
    }
    const field = await casinoProfileService.createField({
      ...body,
      created_by: actorId,
    });
    res.status(201).json(field);
  } catch (e) {
    console.error('createProfileField error:', e);
    sendError(res, 500, 'Failed to create profile field');
  }
}

export async function updateProfileField(req: AuthRequest, res: Response): Promise<void> {
  try {
    const fieldId = Number(req.params.id);
    if (!fieldId) {
      sendError(res, 400, 'Invalid field id');
      return;
    }
    const existing = await casinoProfileService.getFieldById(fieldId);
    if (!existing) {
      sendError(res, 404, 'Field not found');
      return;
    }
    const patch = req.body ?? {};
    const updated = await casinoProfileService.updateField(fieldId, {
      ...patch,
      updated_by: req.user?.id ?? null,
    });
    if (!updated) {
      sendError(res, 400, 'No fields to update');
      return;
    }
    res.json(updated);
  } catch (e) {
    console.error('updateProfileField error:', e);
    sendError(res, 500, 'Failed to update profile field');
  }
}

export async function deleteProfileField(req: AuthRequest, res: Response): Promise<void> {
  try {
    const fieldId = Number(req.params.id);
    if (!fieldId) {
      sendError(res, 400, 'Invalid field id');
      return;
    }
    const existing = await casinoProfileService.getFieldById(fieldId);
    if (!existing) {
      sendError(res, 404, 'Field not found');
      return;
    }
    await casinoProfileService.deleteField(fieldId);
    res.json({ message: 'Field deleted' });
  } catch (e) {
    console.error('deleteProfileField error:', e);
    sendError(res, 500, 'Failed to delete profile field');
  }
}

export async function getCasinoProfile(req: Request, res: Response): Promise<void> {
  try {
    const casinoId = Number(req.params.casinoId);
    if (!casinoId) {
      sendError(res, 400, 'Invalid casinoId');
      return;
    }
    const profile = await casinoProfileService.getCasinoProfile(casinoId);
    res.json(profile);
  } catch (e) {
    console.error('getCasinoProfile error:', e);
    sendError(res, 500, 'Failed to get casino profile');
  }
}

export async function upsertCasinoProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const casinoId = Number(req.params.casinoId);
    if (!casinoId) {
      sendError(res, 400, 'Invalid casinoId');
      return;
    }
    const items = req.body?.items ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      sendError(res, 400, 'items[] is required');
      return;
    }
    await casinoProfileService.upsertCasinoProfile(casinoId, items, req.user?.id ?? null);
    res.json({ message: 'Profile updated' });
  } catch (e) {
    console.error('upsertCasinoProfile error:', e);
    const msg =
      e instanceof SyntaxError
        ? e.message
        : (e as any)?.message || 'Failed to update casino profile';
    sendError(res, 500, msg);
  }
}

export async function getCasinoProfileHistory(req: Request, res: Response): Promise<void> {
  try {
    const casinoId = Number(req.params.casinoId);
    const limit = Number(req.query.limit ?? 200);
    if (!casinoId) {
      sendError(res, 400, 'Invalid casinoId');
      return;
    }
    const rows = await casinoProfileService.getCasinoProfileHistory(casinoId, limit);
    const mapped = rows.map((h) => ({
      id: h.id,
      casino_id: h.casino_id,
      field_id: h.field_id,
      action: h.action,
      old_value_json: h.old_value_json,
      new_value_json: h.new_value_json,
      meta_json: h.meta_json,
      created_at: h.created_at,
      actor_user_id: h.actor_user_id,
      key_name: h.casino_profile_fields?.key_name ?? null,
      label: h.casino_profile_fields?.label ?? null,
      actor_username: h.users?.username ?? null,
    }));
    res.json(mapped);
  } catch (e) {
    console.error('getCasinoProfileHistory error:', e);
    sendError(res, 500, 'Failed to get profile history');
  }
}

export async function getAllProfileValues(_req: Request, res: Response): Promise<void> {
  try {
    const result = await casinoProfileService.getAllProfileValues();
    res.json(result);
  } catch (e) {
    console.error('getAllProfileValues error:', e);
    sendError(res, 500, 'Failed to get all profile values');
  }
}
