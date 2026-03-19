import { Request, Response } from 'express';
import { profileSettingService } from './profileSetting.service';
import { AppError } from '../../errors/AppError';

export async function getCasinoProfileSettings(req: Request, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const geo = req.query.geo as string | undefined;
  const rows = await profileSettingService.getByCasino(casinoId, geo);
  res.json(rows);
}

export async function updateProfileSetting(req: Request, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const { geo, field_id, context_id, value } = req.body ?? {};
  if (!geo || field_id === undefined || context_id === undefined || value === undefined) {
    throw new AppError(400, 'geo, field_id, context_id и value обязательны');
  }
  const row = await profileSettingService.upsert(casinoId, geo, Number(field_id), Number(context_id), !!value);
  res.json(row);
}

export async function batchUpdateProfileSettings(req: Request, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const { geo, settings } = req.body ?? {};
  if (!geo || !Array.isArray(settings) || settings.length === 0) {
    throw new AppError(400, 'GEO и массив настроек обязательны');
  }
  const rows = await profileSettingService.batchUpsert(
    casinoId,
    geo,
    settings.map((s: any) => ({
      field_id: Number(s.field_id),
      context_id: Number(s.context_id),
      value: !!s.value,
    })),
  );
  res.json(rows);
}

export async function getAggregatedProfileSettings(req: Request, res: Response): Promise<void> {
  const geo = req.query.geo as string | undefined;
  const casino_ids = req.query.casino_ids
    ? String(req.query.casino_ids)
        .split(',')
        .map(Number)
        .filter((n) => !isNaN(n))
    : undefined;
  const result = await profileSettingService.getAggregated({ geo, casino_ids });
  res.json(result);
}
