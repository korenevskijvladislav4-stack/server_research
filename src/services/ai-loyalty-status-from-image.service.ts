import OpenAI from 'openai';
import fs from 'fs';

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not set — loyalty status AI disabled');
    return null;
  }
  client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1',
  });
  return client;
}

const SYSTEM = `Ты — помощник аналитика CRM. На скриншоте — карточка ОДНОГО уровня / статуса программы лояльности или VIP (один тир: Bronze, Silver, Gold и т.п.).

Нужно описать ТОЛЬКО этот уровень: привилегии, лимиты, кешбек, персональный менеджер, вывод, подарки — всё, что видно на скрине для этого статуса.

Ответь ОДНИМ JSON-объектом:
- description_md: строка в Markdown (заголовки ## при необходимости, списки, **важное**). Язык как на скрине (русский оставь русским).
- name: краткое название уровня со скрина (если явно видно), иначе null.

Не добавляй информацию соседних уровней, если их нет на этом скрине. Только валидный JSON.`;

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

export type LoyaltyStatusAiResult = {
  description_md: string;
  name: string | null;
};

export async function extractLoyaltyStatusFromImage(
  imagePath: string,
  mimeType?: string,
  hint?: { statusName?: string | null },
): Promise<LoyaltyStatusAiResult | null> {
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
  if (hint?.statusName?.trim()) {
    userParts.push({
      type: 'text',
      text: `В форме указано название статуса (подсказка): ${hint.statusName.trim()}`,
    });
  }
  userParts.push({ type: 'image_url', image_url: { url: dataUrl } });

  try {
    const response = await (openai as OpenAI & { chat: any }).chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userParts },
      ],
      max_tokens: 2048,
      temperature: 0.2,
    });

    const text = pickText(response.choices?.[0]?.message?.content);
    if (!text) return null;
    const match = text.match(/\{[\s\S]*\}/);
    const jsonStr = match ? match[0] : text;
    const raw = JSON.parse(jsonStr) as Record<string, unknown>;
    const description_md =
      typeof raw.description_md === 'string' ? raw.description_md.trim() : '';
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : null;
    if (!description_md) return null;
    return { description_md, name };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('extractLoyaltyStatusFromImage error:', msg);
    return null;
  }
}
