import { Request, Response } from 'express';
import { casinoProviderService } from './casinoProvider.service';
import ExcelJS from 'exceljs';
import { sendError } from '../../common/response';

export async function listCasinoProviders(req: Request, res: Response): Promise<void> {
  try {
    const casinoId = Number(req.params.casinoId);
    const geo = req.query.geo as string | undefined;

    if (!casinoId) {
      res.status(400).json({ error: 'casinoId required' });
      return;
    }

    const list = await casinoProviderService.listCasinoProviders(casinoId, geo);
    res.json(list);
  } catch (e: any) {
    console.error('listCasinoProviders error:', e?.message || e);
    sendError(res, 500, 'Failed to list casino providers');
  }
}

export async function addProviderToCasino(req: Request, res: Response): Promise<void> {
  try {
    const casinoId = Number(req.params.casinoId);
    const { provider_id, provider_name, geo } = req.body as {
      provider_id?: number;
      provider_name?: string;
      geo: string;
    };

    const result = await casinoProviderService.addProviderToCasino(casinoId, {
      provider_id,
      provider_name,
      geo,
    });

    if (result.providerId == null) {
      sendError(res, 400, 'Укажите provider_id или provider_name');
      return;
    }

    res
      .status(201)
      .json(
        result.created ?? {
          casino_id: casinoId,
          provider_id: result.providerId,
          geo: (typeof geo === 'string' ? geo : '').trim(),
        },
      );
  } catch (e: any) {
    console.error('addProviderToCasino error:', e?.message || e);
    sendError(res, 500, 'Failed to add provider to casino');
  }
}

export async function removeProviderFromCasino(req: Request, res: Response): Promise<void> {
  try {
    const casinoId = Number(req.params.casinoId);
    const providerId = Number(req.params.providerId);
    const geo = req.query.geo as string | undefined;

    if (!casinoId || !providerId) {
      res.status(400).json({ error: 'casinoId and providerId required' });
      return;
    }

    await casinoProviderService.removeProviderFromCasino(casinoId, providerId, geo);
    res.json({ ok: true });
  } catch (e: any) {
    console.error('removeProviderFromCasino error:', e?.message || e);
    sendError(res, 500, 'Failed to remove provider from casino');
  }
}

export async function extractAndAddProviders(req: Request, res: Response): Promise<void> {
  try {
    const casinoId = Number(req.params.casinoId);
    const { text, geo } = req.body as { text: string; geo: string };

    if (!casinoId || !geo || typeof geo !== 'string' || !geo.trim()) {
      res.status(400).json({ error: 'casinoId and geo are required' });
      return;
    }
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'text is required' });
      return;
    }

    const result = await casinoProviderService.extractAndAddProviders(
      casinoId,
      geo,
      text,
      undefined,
    );

    if (result.names.length === 0) {
      res.json({ names: [], added: 0, message: 'No provider names extracted' });
      return;
    }

    res.json(result);
  } catch (e: any) {
    console.error('extractAndAddProviders error:', e?.message || e);
    sendError(res, 500, 'Failed to extract and add providers');
  }
}

export async function getProviderAnalytics(req: Request, res: Response): Promise<void> {
  try {
    const geoRaw = req.query.geo;
    const casinoIdRaw = req.query.casino_id;
    const providerIdRaw = req.query.provider_id;

    const geoArr = Array.isArray(geoRaw) ? geoRaw : geoRaw != null ? [geoRaw] : [];
    const geos = geoArr
      .filter((g): g is string => typeof g === 'string')
      .map((g) => g.trim())
      .filter(Boolean);

    const casinoIdArr = Array.isArray(casinoIdRaw) ? casinoIdRaw : casinoIdRaw != null ? [casinoIdRaw] : [];
    const casinoIds = casinoIdArr
      .map((id) => Number(id))
      .filter((id) => !Number.isNaN(id) && id > 0);

    const providerIdArr = Array.isArray(providerIdRaw) ? providerIdRaw : providerIdRaw != null ? [providerIdRaw] : [];
    const providerIds = providerIdArr
      .map((id) => Number(id))
      .filter((id) => !Number.isNaN(id) && id > 0);

    const result = await casinoProviderService.getProviderAnalytics({
      geos,
      casino_ids: casinoIds,
      provider_ids: providerIds,
    });

    res.json(result);
  } catch (e: any) {
    console.error('getProviderAnalytics error:', e?.message || e);
    sendError(res, 500, 'Failed to fetch provider analytics');
  }
}

export async function exportProviderAnalyticsXlsx(req: Request, res: Response): Promise<void> {
  try {
    const geoRaw = req.query.geo;
    const casinoIdRaw = req.query.casino_id;
    const providerIdRaw = req.query.provider_id;

    const geoArr = Array.isArray(geoRaw) ? geoRaw : geoRaw != null ? [geoRaw] : [];
    const geos = geoArr
      .filter((g): g is string => typeof g === 'string')
      .map((g) => g.trim())
      .filter(Boolean);

    const casinoIdArr = Array.isArray(casinoIdRaw) ? casinoIdRaw : casinoIdRaw != null ? [casinoIdRaw] : [];
    const casinoIds = casinoIdArr
      .map((id) => Number(id))
      .filter((id) => !Number.isNaN(id) && id > 0);

    const providerIdArr = Array.isArray(providerIdRaw) ? providerIdRaw : providerIdRaw != null ? [providerIdRaw] : [];
    const providerIds = providerIdArr
      .map((id) => Number(id))
      .filter((id) => !Number.isNaN(id) && id > 0);

    const result = await casinoProviderService.getProviderAnalytics({
      geos,
      casino_ids: casinoIds,
      provider_ids: providerIds,
    });

    const { casinos, providers, connections } = result;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Провайдеры');

    // Заголовки: казино + по одному столбцу на провайдера
    const header = ['Казино', ...providers.map((p) => p.name)];
    sheet.addRow(header);
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };

    // Быстрая проверка подключений
    const connectionSet = new Set<string>();
    for (const c of connections) {
      connectionSet.add(`${c.casino_id}-${c.provider_id}`);
    }

    // Строки по казино
    for (const casino of casinos) {
      const row: (string | number)[] = [casino.name];
      for (const provider of providers) {
        const has = connectionSet.has(`${casino.id}-${provider.id}`);
        row.push(has ? '✓' : '');
      }
      sheet.addRow(row);
    }

    // Немного ширины столбцов
    sheet.getColumn(1).width = 30;
    for (let i = 0; i < providers.length; i++) {
      sheet.getColumn(i + 2).width = 18;
    }

    const filename = `provider_analytics_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (e: any) {
    console.error('exportProviderAnalyticsXlsx error:', e?.message || e);
    sendError(res, 500, 'Failed to export provider analytics');
  }
}

