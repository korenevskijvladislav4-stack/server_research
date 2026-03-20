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

Тебе показывают скриншот страницы депозита/выплаты: может быть одна ПС, несколько разных методов ИЛИ таблица/список из МНОГИХ строк (часто крипто: каждая строка — своя монета/сеть и свои лимиты).

## Один метод на экране (одна карточка / одна строка без таблицы)
Верни ОДИН JSON-объект:
- type, method, при необходимости min_amount, max_amount, currency, notes.

## Таблица или список из нескольких строк (крипто или любые ПС с лимитами по строкам)
Верни ОДИН JSON-объект (не массив):
- type: "Крипто" если это криптовалюты; иначе кратко, например "Платёжные методы" или общий тип.
- method: общее название блока на скрине (например "Криптовалюты", "Crypto", название провайдера) или null, если только перечень монет.
- min_amount, max_amount, currency: НЕ заполняй на корневом уровне (оставь отсутствующими/null), если на скрине несколько разных лимитов по разным строкам — их нельзя свести к одному числу.
- notes: ОБЯЗАТЕЛЬНО. Скопируй ВСЮ информацию по КАЖДОЙ видимой строке: отдельная строка в notes на каждую строку таблицы. Формат удобный для чтения, например:
  "BTC — сеть Bitcoin — мин 0.0001, макс 5\\nETH — ERC-20 — мин 0.01, макс 100\\nUSDT — TRC-20 — мин 10, макс 50000"
  Указывай валюту/актив, сеть (если видна), мин/макс для депозита или вывода (как на скрине), комиссии и примечания если есть.
  Ничего не опускай: если строк 15 — в notes должно быть 15 смысловых строк (или явные подпункты).

## Несколько РАЗНЫХ платёжных методов (не одна таблица лимитов, а карточки Visa / Skrill / Crypto)
Можешь вернуть МАССИВ объектов — по одному на метод; в каждом notes — детали только этого метода.

Общие правила:
- Для многострочной крипты приоритет: один объект + полные notes по всем строкам; не обрезай после первой монеты.
- Числа в JSON как числа, без символов валюты в полях min_amount/max_amount.
- Если поле нельзя прочитать — не включай.

Ответь ТОЛЬКО валидным JSON (один объект или массив объектов) без пояснений.`;

const ALLOWED_KEYS = ['type', 'method', 'min_amount', 'max_amount', 'currency', 'notes'];

function sanitizePaymentRow(obj: any): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of ALLOWED_KEYS) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined && obj[key] !== null) {
      result[key] = obj[key];
    }
  }
  return result;
}

/** Склеивает несколько строк от модели в один объект: полные заметки, без агрегированных min/max/currency. */
function mergeMultiRowPaymentSuggestions(rows: Record<string, unknown>[]): Record<string, unknown> {
  const lines: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const o = rows[i];
    const parts: string[] = [];
    if (o.method) parts.push(String(o.method));
    if (o.type) parts.push(`тип: ${o.type}`);
    if (o.currency) parts.push(`валюта: ${o.currency}`);
    if (o.min_amount != null) parts.push(`мин: ${o.min_amount}`);
    if (o.max_amount != null) parts.push(`макс: ${o.max_amount}`);
    if (o.notes) parts.push(String(o.notes));
    lines.push(parts.length > 0 ? `• ${parts.join(' · ')}` : `• (строка ${i + 1})`);
  }
  const blob = JSON.stringify(rows).toLowerCase();
  const cryptoHint =
    /крипто|crypto|btc|eth|usdt|trx|ton|doge|ltc|xrp|bnb|sol|matic|polygon|bep-20|trc-20|erc-20/.test(blob);
  const first = rows[0];
  return {
    type: cryptoHint ? 'Крипто' : String(first.type || 'Платёжные методы'),
    method:
      rows.length > 1
        ? cryptoHint
          ? 'Криптовалюты (см. заметки)'
          : 'Несколько методов (см. заметки)'
        : first.method,
    notes: lines.join('\n'),
  };
}

export async function extractPaymentFromImage(
  imagePath: string,
  mimeType?: string,
  extraContext?: { geo?: string | null; direction?: string | null },
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
      max_tokens: 8192,
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

    if (Array.isArray(raw)) {
      const rows = raw.map(sanitizePaymentRow).filter((o) => Object.keys(o).length > 0);
      if (rows.length === 0) return null;
      if (rows.length === 1) return rows[0];
      return mergeMultiRowPaymentSuggestions(rows);
    }

    const one = sanitizePaymentRow(raw);
    return Object.keys(one).length > 0 ? one : null;
  } catch (error: any) {
    console.error('extractPaymentFromImage error:', error?.message || error);
    return null;
  }
}
