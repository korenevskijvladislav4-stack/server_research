import OpenAI from 'openai';

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1',
  });
  return client;
}

const SYSTEM = `Ты редактор текста для CRM. На входе — сырой или плохо оформленный текст о программе лояльности казино.
Преобразуй в аккуратный Markdown: при необходимости заголовки ## или ###, маркированные списки, **выделение** важных чисел и условий.
Сохрани язык и смысл; не добавляй фактов, которых нет во входе.
Ответь ТОЛЬКО готовым Markdown без преамбулы и без обёртки в блок кода.`;

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

/** Приведение произвольного текста к читабельному Markdown (кнопка «ИИ оформит»). */
export async function formatPlainTextToMarkdown(source: string): Promise<string | null> {
  const openai = getClient();
  if (!openai) return null;
  const body = source.trim();
  if (!body) return null;
  const model = process.env.OPENAI_MODEL || 'openai/gpt-4o-mini';

  try {
    const response = await (openai as OpenAI & { chat: any }).chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: body.slice(0, 12000) },
      ],
      max_tokens: 4096,
      temperature: 0.2,
    });
    const out = pickText(response.choices?.[0]?.message?.content);
    return out || null;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('formatPlainTextToMarkdown error:', msg);
    return null;
  }
}
