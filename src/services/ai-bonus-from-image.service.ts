import OpenAI from 'openai';
import fs from 'fs';

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not set — AI bonus extraction disabled');
    return null;
  }
  client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1',
  });
  return client;
}

const BONUS_FROM_IMAGE_SYSTEM_PROMPT = `Ты — помощник аналитика, который заносит бонусы онлайн-казино в CRM.

Тебе показывают рекламный баннер / промо-картинку с описанием бонуса (депозитный, бездепозитный, фриспины, кешбек, рейкбек, фрибет и т.п.).

Нужно ПО КАРТИНКЕ и тексту на ней извлечь максимум структурированных данных для формы бонуса.

Структура данных (все поля необязательные, заполняй только если уверен):
- name: строка — человекочитаемое название бонуса (коротко).
- bonus_category: "casino" или "sport".
- bonus_kind: один из ["deposit","nodeposit","cashback","rakeback"].
- bonus_type: один из ["cash","freespin","combo","freebet","wagering","insurance","accumulator","odds_boost"].
- bonus_value: число — основное значение бонуса (процент или сумма).
- bonus_unit: "percent" или "amount" — единица измерения bonus_value.
- currency: строка, код валюты (например "USD","EUR","RUB","BRL") — если указана на баннере.
- freespins_count: число — количество фриспинов, если есть.
- freespin_value: число — стоимость одного фриспина в деньгах (например 0.1, 1, 5), если указано.
- freespin_game: строка — название слота/игры для фриспинов, если указано.
- cashback_percent: число — процент кешбека/рейкбека, если есть.
- cashback_period: один из ["daily","weekly","monthly"] — попытайся угадать по тексту ("ежедневный", "weekly", "каждую неделю" → "weekly" и т.п.). Если непонятно — null.
- min_deposit: число — минимальный депозит для участия в бонусе, если указан.
- max_bonus: число — максимальный размер бонуса (в валюте), если указан.
- max_cashout: число — максимальный кэшаут/вывод по бонусу, если явно указан.
- max_win_cash_value: число — лимит выигрыша по кэш-бонусу (если указано отдельно).
- max_win_cash_unit: "fixed" или "coefficient" — если максимальный выигрыш ограничен фикс. суммой или коэффициентом.
- max_win_freespin_value: число — лимит выигрыша по фриспинам (если указан).
- max_win_freespin_unit: "fixed" или "coefficient".
- max_win_percent_value: число — лимит выигрыша по процентной части бонуса (для комбо).
- max_win_percent_unit: "fixed" или "coefficient".
- wagering_requirement: число — вейджер по кэш-бонусу (например 30 для x30).
- wagering_freespin: число — вейджер по фриспинам (если отдельно указан).
- wagering_games: строка — по каким играм отыгрыш, если это понятно (например "all slots", "live casino excluded").
- wagering_time_limit: строка — срок отыгрыша (например "7 days", "24h").
- promo_code: строка — промокод, если есть.
- valid_from: строка даты в формате "YYYY-MM-DD" — дата начала, если указана.
- valid_to: строка даты в формате "YYYY-MM-DD" — дата окончания, если указана.
- status: одно из ["active","paused","expired","draft"] — можно прикинуть по тексту, но если не очевидно, ставь "active".
- notes: произвольная строка с полезными уточнениями, которые не поместились в поля (например ограничения по странам, ставкам, типам игр).

ВАЖНО:
- Если поле однозначно прочитать нельзя — верни для него null или не включай.
- Числа пиши как числа, без символов.
- Даты пиши в формате "YYYY-MM-DD", если на баннере явно виден диапазон.

Ответь ТОЛЬКО ОДНИМ валидным JSON-объектом без пояснений.`;

export async function extractBonusFromImage(
  imagePath: string,
  mimeType?: string,
  extraContext?: { geo?: string | null },
): Promise<Record<string, unknown> | null> {
  const openai = getClient();
  if (!openai) return null;

  const buffer = fs.readFileSync(imagePath);
  const base64 = buffer.toString('base64');
  const mime = mimeType || 'image/png';
  const dataUrl = `data:${mime};base64,${base64}`;

  try {
    const userContent: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    > = [];

    if (extraContext?.geo) {
      userContent.push({
        type: 'text',
        text: `GEO: ${extraContext.geo}`,
      });
    }

    userContent.push({
      type: 'image_url',
      image_url: { url: dataUrl },
    });

    const response = await (openai as any).chat.completions.create({
      model: process.env.OPENAI_MODEL || 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: BONUS_FROM_IMAGE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: userContent,
        },
      ],
      max_tokens: 900,
      temperature: 0.2,
    });

    const content = response.choices?.[0]?.message?.content;
    const text =
      typeof content === 'string'
        ? content.trim()
        : Array.isArray(content)
        ? content
            .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
            .join('\n')
            .trim()
        : '';

    if (!text) return null;

    const match = text.match(/\{[\s\S]*\}/);
    const jsonStr = match ? match[0] : text;
    const raw = JSON.parse(jsonStr);
    if (!raw || typeof raw !== 'object') return null;

    const result: Record<string, unknown> = {};
    const copyIfDefined = (key: string) => {
      if (Object.prototype.hasOwnProperty.call(raw, key) && raw[key] !== undefined) {
        result[key] = raw[key];
      }
    };

    [
      'name',
      'bonus_category',
      'bonus_kind',
      'bonus_type',
      'bonus_value',
      'bonus_unit',
      'currency',
      'freespins_count',
      'freespin_value',
      'freespin_game',
      'cashback_percent',
      'cashback_period',
      'min_deposit',
      'max_bonus',
      'max_cashout',
      'max_win_cash_value',
      'max_win_cash_unit',
      'max_win_freespin_value',
      'max_win_freespin_unit',
      'max_win_percent_value',
      'max_win_percent_unit',
      'wagering_requirement',
      'wagering_freespin',
      'wagering_games',
      'wagering_time_limit',
      'promo_code',
      'valid_from',
      'valid_to',
      'status',
      'notes',
    ].forEach(copyIfDefined);

    return result;
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error('extractBonusFromImage error:', error?.message || error);
    return null;
  }
}

