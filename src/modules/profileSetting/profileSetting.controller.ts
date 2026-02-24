import { Request, Response } from 'express';
import { profileSettingService } from './profileSetting.service';
import { sendError } from '../../common/response';

export async function getCasinoProfileSettings(req: Request, res: Response): Promise<void> {
  try {
    const casinoId = Number(req.params.casinoId);
    const geo = req.query.geo as string | undefined;
    const rows = await profileSettingService.getByCasino(casinoId, geo);
    res.json(rows);
  } catch (e) {
    console.error('getCasinoProfileSettings error:', e);
    sendError(res, 500, 'Failed to fetch casino profile settings');
  }
}

export async function updateProfileSetting(req: Request, res: Response): Promise<void> {
  try {
    const casinoId = Number(req.params.casinoId);
    const { geo, field_id, context_id, value } = req.body ?? {};
    if (!geo || field_id === undefined || context_id === undefined || value === undefined) {
      sendError(res, 400, 'geo, field_id, context_id, and value are required');
      return;
    }
    const row = await profileSettingService.upsert(casinoId, geo, Number(field_id), Number(context_id), !!value);
    res.json(row);
  } catch (e) {
    console.error('updateProfileSetting error:', e);
    sendError(res, 500, 'Failed to update profile setting');
  }
}

export async function batchUpdateProfileSettings(req: Request, res: Response): Promise<void> {
  try {
    const casinoId = Number(req.params.casinoId);
    const { geo, settings } = req.body ?? {};
    if (!geo || !Array.isArray(settings) || settings.length === 0) {
      sendError(res, 400, 'geo and settings array are required');
      return;
    }
    const rows = await profileSettingService.batchUpsert(
      casinoId,
      geo,
      settings.map((s: any) => ({
        field_id: Number(s.field_id),
        context_id: Number(s.context_id),
        value: !!s.value,
      }))
    );
    res.json(rows);
  } catch (e) {
    console.error('batchUpdateProfileSettings error:', e);
    sendError(res, 500, 'Failed to batch update profile settings');
  }
}

export async function getAggregatedProfileSettings(req: Request, res: Response): Promise<void> {
  try {
    const geo = req.query.geo as string | undefined;
    const casino_ids = req.query.casino_ids
      ? String(req.query.casino_ids)
          .split(',')
          .map(Number)
          .filter((n) => !isNaN(n))
      : undefined;
    const result = await profileSettingService.getAggregated({ geo, casino_ids });
    res.json(result);
  } catch (e) {
    console.error('getAggregatedProfileSettings error:', e);
    sendError(res, 500, 'Failed to fetch aggregated profile settings');
  }
}
