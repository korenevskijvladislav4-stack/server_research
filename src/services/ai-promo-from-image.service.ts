import OpenAI from 'openai';
import fs from 'fs';

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not set — AI promo extraction disabled');
    return null;
  }
  client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1',
  });
  return client;
}

const PROMO_FROM_IMAGE_SYSTEM = `Ты — помощник аналитика CRM для промо-акций онлайн-казино (турниры, лотереи, акции).

По скриншоту промо-письма / баннера и дополнительному тексту письма извлеки поля для карточки промо.

Поля (все необязательны):
- name: короткое название акции.
- promo_category: одно из ["tournament","promotion","lottery"].
- promo_type: строка — тип/подтип (например "турнир по слотам", "кэш-дроп").
- period_start, period_end: даты "YYYY-MM-DD", если видны.
- period_type: одно из ["fixed","daily","weekly","monthly"] — если явно из текста.
- has_participation_button: boolean — есть ли явная кнопка участия / CTA.
- provider: провайдер игр, если указан.
- prize_fund: призовой фонд как строка (например "50 000 EUR", "1 BTC").
- mechanics: кратко правила участия.
- min_bet: минимальная ставка, строка.
- wagering_prize: отыгрыш приза, строка.
- status: одно из ["active","paused","expired","draft"] — если неясно, "active".
- casino_name: бренд казино.
- geo: код страны ISO 2 буквы или "ALL".

Ответь ТОЛЬКО одним JSON-объектом без пояснений.`;

export async function extractPromoFromImage(
  imagePath: string,
  mimeType?: string,
  extraContext?: { geo?: string | null; emailText?: string | null },
): Promise<Record<string, unknown> | null> {
  const openai = getClient();
  if (!openai) return null;

  const buffer = fs.readFileSync(imagePath);
  const base64 = buffer.toString('base64');
  const mime = mimeType || 'image/png';
  const dataUrl = `data:${mime};base64,${base64}`;

  try {
    const userContent: Array<
      { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
    > = [];

    if (extraContext?.geo) {
      userContent.push({ type: 'text', text: `GEO (подсказка из CRM): ${extraContext.geo}` });
    }
    if (extraContext?.emailText?.trim()) {
      userContent.push({
        type: 'text',
        text: `Текст письма:\n${extraContext.emailText.trim().slice(0, 8000)}`,
      });
    }
    userContent.push({ type: 'image_url', image_url: { url: dataUrl } });

    const response = await (openai as any).chat.completions.create({
      model: process.env.OPENAI_MODEL || 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: PROMO_FROM_IMAGE_SYSTEM },
        { role: 'user', content: userContent },
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

    const keys = [
      'name',
      'promo_category',
      'promo_type',
      'period_start',
      'period_end',
      'period_type',
      'has_participation_button',
      'provider',
      'prize_fund',
      'mechanics',
      'min_bet',
      'wagering_prize',
      'status',
      'casino_name',
      'geo',
    ];
    const result: Record<string, unknown> = {};
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(raw, k) && raw[k] !== undefined) {
        result[k] = raw[k];
      }
    }
    return result;
  } catch (error: any) {
    console.error('extractPromoFromImage error:', error?.message || error);
    return null;
  }
}
