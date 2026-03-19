import { Request, Response } from 'express';
import { casinoProviderService } from './casinoProvider.service';
import ExcelJS from 'exceljs';
import { AppError } from '../../errors/AppError';

export async function listCasinoProviders(req: Request, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const geo = req.query.geo as string | undefined;

  if (!casinoId) {
    throw new AppError(400, 'ID казино обязателен');
  }

  const list = await casinoProviderService.listCasinoProviders(casinoId, geo);
  res.json(list);
}

export async function addProviderToCasino(req: Request, res: Response): Promise<void> {
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
    throw new AppError(400, 'Укажите provider_id или provider_name');
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
}

export async function removeProviderFromCasino(req: Request, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const providerId = Number(req.params.providerId);
  const geo = req.query.geo as string | undefined;

  if (!casinoId || !providerId) {
    throw new AppError(400, 'ID казино и провайдера обязательны');
  }

  await casinoProviderService.removeProviderFromCasino(casinoId, providerId, geo);
  res.json({ ok: true });
}

export async function extractAndAddProviders(req: Request, res: Response): Promise<void> {
  const casinoId = Number(req.params.casinoId);
  const { text, geo } = req.body as { text: string; geo: string };

  if (!casinoId || !geo || typeof geo !== 'string' || !geo.trim()) {
    throw new AppError(400, 'ID казино и GEO обязательны');
  }
  if (!text || typeof text !== 'string') {
    throw new AppError(400, 'Текст обязателен');
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
}

export async function getProviderAnalytics(req: Request, res: Response): Promise<void> {
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
}

export async function exportProviderAnalyticsXlsx(req: Request, res: Response): Promise<void> {
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
}
