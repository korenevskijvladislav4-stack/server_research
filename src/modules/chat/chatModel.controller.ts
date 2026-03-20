import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { AppError } from '../../errors/AppError';
import * as chatModelService from './chatModel.service';

export async function listChatAiModelsAdmin(_req: AuthRequest, res: Response): Promise<void> {
  const rows = await chatModelService.listAllChatAiModelsAdmin();
  res.json(rows);
}

export async function createChatAiModel(req: AuthRequest, res: Response): Promise<void> {
  const b = req.body as Record<string, unknown>;
  const row = await chatModelService.createChatAiModel({
    model_id: String(b.model_id ?? ''),
    label: String(b.label ?? ''),
    input_price_per_million:
      b.input_price_per_million === undefined || b.input_price_per_million === null
        ? null
        : Number(b.input_price_per_million),
    output_price_per_million:
      b.output_price_per_million === undefined || b.output_price_per_million === null
        ? null
        : Number(b.output_price_per_million),
    is_active: b.is_active === undefined ? undefined : Boolean(b.is_active),
    sort_order: b.sort_order === undefined ? undefined : Number(b.sort_order),
  });
  res.status(201).json(row);
}

export async function updateChatAiModel(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (!id) throw new AppError(400, 'Некорректный id');
  const b = req.body as Record<string, unknown>;
  const patch: Parameters<typeof chatModelService.updateChatAiModel>[1] = {};
  if (b.model_id !== undefined) patch.model_id = String(b.model_id);
  if (b.label !== undefined) patch.label = String(b.label);
  if (b.input_price_per_million !== undefined) {
    patch.input_price_per_million =
      b.input_price_per_million === null ? null : Number(b.input_price_per_million);
  }
  if (b.output_price_per_million !== undefined) {
    patch.output_price_per_million =
      b.output_price_per_million === null ? null : Number(b.output_price_per_million);
  }
  if (b.is_active !== undefined) patch.is_active = Boolean(b.is_active);
  if (b.sort_order !== undefined) patch.sort_order = Number(b.sort_order);
  const row = await chatModelService.updateChatAiModel(id, patch);
  res.json(row);
}

export async function deleteChatAiModel(req: AuthRequest, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (!id) throw new AppError(400, 'Некорректный id');
  try {
    await chatModelService.deleteChatAiModel(id);
  } catch {
    throw new AppError(404, 'Модель не найдена');
  }
  res.status(204).send();
}
