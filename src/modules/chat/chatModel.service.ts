import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';

export const DEFAULT_CHAT_MODEL = 'openai/gpt-4o-mini';

export function getEnvModelAllowlist(): string[] {
  const raw = process.env.CHAT_MODEL_OPTIONS?.trim();
  const fallback = process.env.OPENAI_MODEL?.trim() || DEFAULT_CHAT_MODEL;
  if (!raw) return [fallback];
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : [fallback];
}

function formatModelLabel(id: string): string {
  const tail = id.includes('/') ? id.split('/').slice(1).join(' / ') : id;
  return tail.replace(/-/g, ' ');
}

function decimalToNumber(v: Prisma.Decimal | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Активные model_id из БД; пустой массив если таблица пустая — тогда снаружи используют env. */
export async function getDbActiveModelIds(): Promise<string[]> {
  const rows = await prisma.chat_ai_models.findMany({
    where: { is_active: true },
    orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    select: { model_id: true },
  });
  return rows.map((r) => r.model_id);
}

export async function hasAnyChatAiModel(): Promise<boolean> {
  const n = await prisma.chat_ai_models.count();
  return n > 0;
}

export async function resolveChatModel(requested?: string | null): Promise<string> {
  const hasDb = await hasAnyChatAiModel();
  const allow = hasDb ? await getDbActiveModelIds() : getEnvModelAllowlist();
  const def = allow[0] ?? DEFAULT_CHAT_MODEL;
  if (!requested || typeof requested !== 'string') return def;
  const t = requested.trim();
  return allow.includes(t) ? t : def;
}

export type ChatModelClientDto = {
  id: string;
  label: string;
  input_price_per_million: number | null;
  output_price_per_million: number | null;
};

export type ChatClientConfigDto = {
  defaultModel: string;
  models: ChatModelClientDto[];
  source: 'database' | 'env';
};

export async function getChatModelsForClient(): Promise<ChatClientConfigDto> {
  const rows = await prisma.chat_ai_models.findMany({
    where: { is_active: true },
    orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
  });

  if (rows.length > 0) {
    return {
      defaultModel: rows[0].model_id,
      source: 'database',
      models: rows.map((r) => ({
        id: r.model_id,
        label: r.label?.trim() || formatModelLabel(r.model_id),
        input_price_per_million: decimalToNumber(r.input_price_per_million),
        output_price_per_million: decimalToNumber(r.output_price_per_million),
      })),
    };
  }

  const ids = getEnvModelAllowlist();
  return {
    defaultModel: ids[0] ?? DEFAULT_CHAT_MODEL,
    source: 'env',
    models: ids.map((id) => ({
      id,
      label: formatModelLabel(id),
      input_price_per_million: null,
      output_price_per_million: null,
    })),
  };
}

export async function listAllChatAiModelsAdmin() {
  return prisma.chat_ai_models.findMany({
    orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
  });
}

export async function createChatAiModel(data: {
  model_id: string;
  label: string;
  input_price_per_million?: number | null;
  output_price_per_million?: number | null;
  is_active?: boolean;
  sort_order?: number;
}) {
  const modelId = data.model_id.trim();
  return prisma.chat_ai_models.create({
    data: {
      model_id: modelId,
      label: data.label.trim() || formatModelLabel(modelId),
      input_price_per_million:
        data.input_price_per_million === undefined || data.input_price_per_million === null
          ? null
          : data.input_price_per_million,
      output_price_per_million:
        data.output_price_per_million === undefined || data.output_price_per_million === null
          ? null
          : data.output_price_per_million,
      is_active: data.is_active ?? true,
      sort_order: data.sort_order ?? 0,
    },
  });
}

export async function updateChatAiModel(
  id: number,
  data: Partial<{
    model_id: string;
    label: string;
    input_price_per_million: number | null;
    output_price_per_million: number | null;
    is_active: boolean;
    sort_order: number;
  }>,
) {
  const patch: Record<string, unknown> = {};
  if (data.model_id !== undefined) patch.model_id = data.model_id.trim();
  if (data.label !== undefined) patch.label = data.label.trim();
  if (data.input_price_per_million !== undefined) patch.input_price_per_million = data.input_price_per_million;
  if (data.output_price_per_million !== undefined)
    patch.output_price_per_million = data.output_price_per_million;
  if (data.is_active !== undefined) patch.is_active = data.is_active;
  if (data.sort_order !== undefined) patch.sort_order = data.sort_order;
  return prisma.chat_ai_models.update({
    where: { id },
    data: patch as Prisma.chat_ai_modelsUpdateInput,
  });
}

export async function deleteChatAiModel(id: number) {
  await prisma.chat_ai_models.delete({ where: { id } });
}
