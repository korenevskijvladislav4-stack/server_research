import OpenAI from 'openai';
import fs from 'fs';

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not set — loyalty AI extraction disabled');
    return null;
  }
  client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1',
  });
  return client;
}

const LOYALTY_SYSTEM = `Ты — помощник аналитика CRM. По скриншоту страницы программы лояльности / VIP / статусов казино извлеки структуру для карточки казино.

Верни ОДИН JSON-объект:
- orientation: "casino" если акцент на казино/слоты; "sport" если явно спорт/ставки; если непонятно — null.
- conditions_md: строка в Markdown — как достигаются уровни (оборот, очки, депозиты, сроки). Заголовки ##/###, списки, **важное**. Язык: русский, если на скрине русский; иначе сохрани язык оригинала.
- statuses: массив объектов { "name": "название уровня", "description_md": "привилегии и условия уровня в Markdown" } — по порядку от младшего к старшему, если видно.

Правила:
- Не выдумывай уровни, которых нет на скрине.
- Если уровень один — один элемент в statuses.
- Только валидный JSON без пояснений снаружи.`;

export type LoyaltyAiSuggestion = {
  orientation: 'casino' | 'sport' | null;
  conditions_md: string;
  statuses: Array<{ name: string; description_md: string }>;
};

function pickText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part: { text?: string }) => (typeof part?.text === 'string' ? part.text : ''))
      .join('\n')
      .trim();
  }
  return '';
}

export async function extractLoyaltyFromImage(
  imagePath: string,
  mimeType?: string,
  extra?: { geoHint?: string | null },
): Promise<LoyaltyAiSuggestion | null> {
  const openai = getClient();
  if (!openai) return null;

  const buffer = fs.readFileSync(imagePath);
  const base64 = buffer.toString('base64');
  const mime = mimeType || 'image/png';
  const dataUrl = `data:${mime};base64,${base64}`;
  const model = process.env.OPENAI_MODEL || 'openai/gpt-4o-mini';

  const userParts: Array<
    { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
  > = [];
  if (extra?.geoHint?.trim()) {
    userParts.push({ type: 'text', text: `GEO в CRM (подсказка): ${extra.geoHint.trim()}` });
  }
  userParts.push({ type: 'image_url', image_url: { url: dataUrl } });

  try {
    const response = await (openai as OpenAI & { chat: any }).chat.completions.create({
      model,
      messages: [
        { role: 'system', content: LOYALTY_SYSTEM },
        { role: 'user', content: userParts },
      ],
      max_tokens: 4096,
      temperature: 0.2,
    });

    const text = pickText(response.choices?.[0]?.message?.content);
    if (!text) return null;
    const match = text.match(/\{[\s\S]*\}/);
    const jsonStr = match ? match[0] : text;
    const raw = JSON.parse(jsonStr) as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') return null;

    const orientationRaw = raw.orientation;
    let orientation: 'casino' | 'sport' | null = null;
    if (orientationRaw === 'casino' || orientationRaw === 'sport') orientation = orientationRaw;

    const conditions_md =
      typeof raw.conditions_md === 'string' ? raw.conditions_md.trim() : '';

    const statusesIn = raw.statuses;
    const statuses: Array<{ name: string; description_md: string }> = [];
    if (Array.isArray(statusesIn)) {
      for (const row of statusesIn) {
        if (!row || typeof row !== 'object') continue;
        const o = row as Record<string, unknown>;
        const name = typeof o.name === 'string' ? o.name.trim() : '';
        const description_md =
          typeof o.description_md === 'string' ? o.description_md.trim() : '';
        if (name || description_md) {
          statuses.push({
            name: name || 'Статус',
            description_md: description_md || '—',
          });
        }
      }
    }

    return {
      orientation,
      conditions_md: conditions_md || '—',
      statuses: statuses.length > 0 ? statuses : [{ name: 'Уровень', description_md: '—' }],
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('extractLoyaltyFromImage error:', msg);
    return null;
  }
}
