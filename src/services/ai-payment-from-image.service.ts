import OpenAI from 'openai';
import fs from 'fs';

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not set — AI payment extraction disabled');
    return null;
  }
  client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1',
  });
  return client;
}

const PAYMENT_FROM_IMAGE_SYSTEM_PROMPT = `Ты — помощник аналитика, который заносит платёжные решения (ПС) онлайн-казино в CRM.

Тебе показывают скриншот страницы депозита/выплаты казино с перечнем платёжных методов.

Нужно ПО КАРТИНКЕ извлечь информацию о КОНКРЕТНОМ платёжном методе (или нескольких, если очевидно).

Структура данных (все поля необязательные, заполняй только если уверен):
- type: строка — тип платёжной системы. Примеры: "Банковская карта", "Электронный кошелёк", "Крипто", "Мобильный платёж", "Банковский перевод", "Ваучер", "P2P", "СБП". Определяй тип по названию ПС.
- method: строка — конкретное название ПС (например: "Visa", "MasterCard", "Skrill", "Neteller", "Bitcoin", "USDT TRC-20", "PIX", "Apple Pay", "МИР", "СБП", "Jeton", "ecoPayz", "AstroPay", "Boleto" и т.д.).
- min_amount: число — минимальная сумма для депозита/выплаты, если указана.
- max_amount: число — максимальная сумма, если указана.
- currency: строка — код валюты (USD, EUR, RUB, BRL, USDT и т.д.), если указана.
- notes: строка — дополнительная информация. ОБЯЗАТЕЛЬНО заполняй для крипто-ПС: перечисли ВСЕ криптовалюты, сети и лимиты, которые видны на скриншоте (например: "BTC: мин. 0.0001, макс. 1; ETH: мин. 0.01, макс. 10; USDT TRC-20: мин. 1, макс. 50000; USDT ERC-20: мин. 10, макс. 50000"). Для обычных ПС тоже пиши важные детали: комиссии, время обработки, ограничения.

ВАЖНО:
- Если на скриншоте видно НЕСКОЛЬКО платёжных методов, верни массив объектов.
- Если виден ОДИН метод — верни один объект (не массив).
- Если это крипто, notes ОБЯЗАТЕЛЬНО должен содержать все видимые валюты/сети с лимитами.
- Числа пиши как числа, без символов валюты.
- Если поле однозначно прочитать нельзя — не включай его.

Ответь ТОЛЬКО валидным JSON (объект или массив) без пояснений.`;

export async function extractPaymentFromImage(
  imagePath: string,
  mimeType?: string,
  extraContext?: { geo?: string | null; direction?: string | null },
): Promise<Record<string, unknown> | Record<string, unknown>[] | null> {
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

    const contextParts: string[] = [];
    if (extraContext?.geo) contextParts.push(`GEO: ${extraContext.geo}`);
    if (extraContext?.direction) {
      contextParts.push(`Направление: ${extraContext.direction === 'withdrawal' ? 'Выплата' : 'Депозит'}`);
    }
    if (contextParts.length > 0) {
      userContent.push({ type: 'text', text: contextParts.join(', ') });
    }

    userContent.push({
      type: 'image_url',
      image_url: { url: dataUrl },
    });

    const response = await (openai as any).chat.completions.create({
      model: process.env.OPENAI_MODEL || 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: PAYMENT_FROM_IMAGE_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_tokens: 1500,
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

    const match = text.match(/[\[{][\s\S]*[\]}]/);
    const jsonStr = match ? match[0] : text;
    const raw = JSON.parse(jsonStr);
    if (!raw || typeof raw !== 'object') return null;

    const ALLOWED_KEYS = ['type', 'method', 'min_amount', 'max_amount', 'currency', 'notes'];

    const sanitize = (obj: any): Record<string, unknown> => {
      const result: Record<string, unknown> = {};
      for (const key of ALLOWED_KEYS) {
        if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined) {
          result[key] = obj[key];
        }
      }
      return result;
    };

    if (Array.isArray(raw)) {
      return raw.map(sanitize);
    }
    return sanitize(raw);
  } catch (error: any) {
    console.error('extractPaymentFromImage error:', error?.message || error);
    return null;
  }
}
