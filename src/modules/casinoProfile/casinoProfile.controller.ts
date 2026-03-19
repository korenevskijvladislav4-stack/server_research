import { Request, Response } from 'express';
import { casinoProfileService } from './casinoProfile.service';
import { AppError } from '../../errors/AppError';
import { AuthRequest } from '../../middleware/auth.middleware';

export async function listProfileFields(_req: Request, res: Response): Promise<void> {
  const rows = await casinoProfileService.listFields();
  res.json(rows);
}

export async function createProfileField(req: AuthRequest, res: Response): Promise<void> {
  const actorId = req.user?.id ?? null;
  const body = req.body ?? {};
  if (!body.key_name || !body.label || !body.field_type) {
    throw new AppError(400, 'key_name, label и field_type обязательны');
  }
  const field = await casinoProfileService.createField({
    ...body,
    created_by: actorId,
  });
  res.status(201).json(field);
}

export async function updateProfileField(req: AuthRequest, res: Response): Promise<void> {
  const fieldId = Number(req.params.id);
  if (!fieldId) {
    throw new AppError(400, 'Некорректный ID поля');
  }
  const existing = await casinoProfileService.getFieldById(fieldId);
  if (!existing) {
    throw new AppError(404, 'Поле профиля не найдено');
  }
  const patch = req.body ?? {};
  const updated = await casinoProfileService.updateField(fieldId, {
    ...patch,
    updated_by: req.user?.id ?? null,
  });
  if (!updated) {
    throw new AppError(400, 'Нет полей для обновления');
  }
  res.json(updated);
}

export async function deleteProfileField(req: AuthRequest, res: Response): Promise<void> {
  const fieldId = Number(req.params.id);
  if (!fieldId) {
    throw new AppError(400, 'Некорректный ID поля');
  }
  const existing = await casinoProfileService.getFieldById(fieldId);
  if (!existing) {
    throw new AppError(404, 'Поле профиля не найдено');
  }
  await casinoProfileService.deleteField(fieldId);
  res.json({ message: 'Field deleted' });
}

export async function getCasinoProfile(req: Request, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  if (!casinoId) {
    throw new AppError(400, 'Некорректный ID казино');
  }
  const geoParam = typeof req.query.geo === 'string' && req.query.geo.trim() ? req.query.geo.trim() : undefined;
  const profile = await casinoProfileService.getCasinoProfile(casinoId, geoParam);
  res.json(profile);
}

export async function upsertCasinoProfile(req: AuthRequest, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  if (!casinoId) {
    throw new AppError(400, 'Некорректный ID казино');
  }
  const items = req.body?.items ?? [];
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError(400, 'Список элементов обязателен');
  }
  const geoParam = typeof req.query.geo === 'string' && req.query.geo.trim() ? req.query.geo.trim() : undefined;
  await casinoProfileService.upsertCasinoProfile(casinoId, items, req.user?.id ?? null, geoParam);
  res.json({ message: 'Profile updated' });
}

export async function getCasinoProfileHistory(req: Request, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const limit = Number(req.query.limit ?? 200);
  if (!casinoId) {
    throw new AppError(400, 'Некорректный ID казино');
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
}

export async function getAllProfileValues(_req: Request, res: Response): Promise<void> {
  const result = await casinoProfileService.getAllProfileValues();
  res.json(result);
}
