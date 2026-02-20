import OpenAI from 'openai';
import pool from '../database/connection';
import { RowDataPacket } from 'mysql2';

// ---------------------------------------------------------------------------
// OpenAI client (lazy init)
// ---------------------------------------------------------------------------

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not set — AI email summaries disabled');
    return null;
  }
  client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1',
  });
  return client;
}

// ---------------------------------------------------------------------------
// Strip HTML tags to plain text (lightweight, no extra deps)
// ---------------------------------------------------------------------------

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Summarize a single email
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Ты — помощник аналитика в исследовательской компании, которая анализирует онлайн-казино.
Тебе приходят письма от различных казино (партнёрки, промо, бонусы, KYC, поддержка и т.д.).

Твоя задача — дать ОЧЕНЬ короткое (1-3 предложения, макс 200 символов) пояснение на русском языке:
- Что предлагают/просят в письме
- Если это промо — какой бонус/оффер
- Если это техническое — суть запроса

Отвечай ТОЛЬКО кратким пояснением, без вступлений и маркеров.`;

export async function summarizeEmail(emailId: number): Promise<string | null> {
  const openai = getClient();
  if (!openai) return null;

  try {
    // Get email content
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT subject, from_name, from_email, body_text, body_html FROM emails WHERE id = ?',
      [emailId],
    );
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const email = rows[0] as any;

    // Build text content (prefer body_text, fallback to stripped HTML)
    let body = email.body_text || '';
    if (!body && email.body_html) {
      body = htmlToText(email.body_html);
    }

    // Truncate to ~2000 chars to save tokens
    if (body.length > 2000) {
      body = body.slice(0, 2000) + '…';
    }

    const userMessage = [
      `От: ${email.from_name || ''} <${email.from_email || ''}>`,
      `Тема: ${email.subject || '(без темы)'}`,
      '',
      body || '(пустое письмо)',
    ].join('\n');

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 150,
      temperature: 0.3,
    });

    const summary = response.choices[0]?.message?.content?.trim() || null;

    if (summary) {
      await pool.query('UPDATE emails SET ai_summary = ? WHERE id = ?', [summary, emailId]);
    }

    return summary;
  } catch (error: any) {
    console.error(`AI summary error for email ${emailId}:`, error?.message || error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Summarize specific emails by IDs (only new ones from sync)
// ---------------------------------------------------------------------------

export async function summarizeEmailsByIds(ids: number[]): Promise<number> {
  if (!ids || ids.length === 0) return 0;
  const openai = getClient();
  if (!openai) return 0;

  let count = 0;
  for (const id of ids) {
    try {
      const result = await summarizeEmail(id);
      if (result) count++;
    } catch (e: any) {
      console.error(`AI summary error for email ${id}:`, e?.message || e);
    }
  }

  if (count > 0) {
    console.log(`AI summarized ${count} new email(s)`);
  }
  return count;
}

// ---------------------------------------------------------------------------
// Assign email topic (theme) by AI from configurable list
// ---------------------------------------------------------------------------

const TOPIC_SYSTEM = `Ты — классификатор писем. Тебе дают список тем писем с описаниями и текст письма (тема + тело).
Выбери ОДНУ тему, которая лучше всего подходит к письму, опираясь на описание темы. Если ни одна тема не подходит — верни 0.
Отвечай ТОЛЬКО одним числом: id выбранной темы или 0. Никакого текста.`;

export async function assignEmailTopic(emailId: number): Promise<number | null> {
  const openai = getClient();
  if (!openai) return null;

  try {
    const [topicRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name, description FROM email_topics ORDER BY sort_order ASC, name ASC',
    );
    const topics = (topicRows || []) as { id: number; name: string; description?: string | null }[];
    if (topics.length === 0) return null;

    const [emailRows] = await pool.query<RowDataPacket[]>(
      'SELECT subject, from_name, from_email, body_text, body_html FROM emails WHERE id = ?',
      [emailId],
    );
    if (!Array.isArray(emailRows) || emailRows.length === 0) return null;
    const email = emailRows[0] as any;
    let body = email.body_text || '';
    if (!body && email.body_html) body = htmlToText(email.body_html);
    if (body.length > 2500) body = body.slice(0, 2500) + '…';

    const topicList = topics
      .map((t) => `ID ${t.id}: "${t.name}" — ${t.description || '(без описания)'}`)
      .join('\n');
    const userContent = [
      'Темы (выбери один id или 0):',
      topicList,
      '---',
      `Письмо:\nТема: ${email.subject || '(нет)'}\nОт: ${email.from_name || ''} <${email.from_email || ''}>\n\n${body || '(пусто)'}`,
    ].join('\n');

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: TOPIC_SYSTEM },
        { role: 'user', content: userContent },
      ],
      max_tokens: 20,
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content?.trim() || '';
    const num = parseInt(content.replace(/\D/g, ''), 10);
    const topicId = Number.isNaN(num) ? null : num === 0 ? null : topics.some((t) => t.id === num) ? num : null;
    await pool.query('UPDATE emails SET topic_id = ? WHERE id = ?', [topicId, emailId]);
    return topicId;
  } catch (error: any) {
    console.error(`assignEmailTopic error for email ${emailId}:`, error?.message || error);
    return null;
  }
}

export async function assignEmailTopicsByIds(ids: number[]): Promise<number> {
  if (!ids || ids.length === 0) return 0;
  const openai = getClient();
  if (!openai) return 0;
  let count = 0;
  for (const id of ids) {
    try {
      const result = await assignEmailTopic(id);
      if (result != null) count++;
    } catch (e: any) {
      console.error(`assignEmailTopic error for ${id}:`, e?.message || e);
    }
  }
  if (count > 0) console.log(`AI assigned topics to ${count} email(s)`);
  return count;
}

// ---------------------------------------------------------------------------
// Extract provider names from arbitrary text (HTML, JSON, or plain list)
// Used for "Подключенные провайдеры" on casino profile: user pastes content, we extract names
// ---------------------------------------------------------------------------

const EXTRACT_PROVIDERS_SYSTEM = `Ты — помощник по извлечению структурированных данных. Контекст: онлайн-казино, провайдеры игр (слоты, настольные игры и т.д.). Примеры названий провайдеров: Pragmatic Play, NetEnt, Microgaming, Play'n GO, Evolution, Red Tiger, Yggdrasil, Hacksaw Gaming, Nolimit City, Big Time Gaming.

Тебе приходит фрагмент текста: это может быть HTML-разметка страницы казино, JSON-объект (массив игр/провайдеров) или просто список. Твоя задача — извлечь ВСЕ упоминания названий провайдеров (игровых провайдеров, вендоров слотов).

Правила:
1. Верни ТОЛЬКО JSON-массив строк — названия провайдеров, по одному в элементе. Пример: ["Pragmatic Play", "NetEnt", "Evolution"].
2. Никакого пояснительного текста до или после массива — только валидный JSON.
3. Нормализуй названия: убирай лишние пробелы, не дублируй одинаковые (учитывай регистр как один провайдер).
4. Из HTML извлекай названия из атрибутов (data-provider, class с provider), из текста ссылок/кнопок с провайдерами, из списков.
5. Из JSON извлекай поля вроде provider, vendor, gameProvider, developer и т.п. — значения могут быть вложены в объекты или массивы.
6. Если провайдер указан в нескольких вариантах написания — оставь один, наиболее полный/официальный вариант (например "Pragmatic Play", а не "Pragmatic").
7. Если во входящем тексте нет ни одного провайдера — верни пустой массив: [].
8. Не включай в список общие слова (Casino, Game, Slot, Play и т.д.) — только конкретные названия компаний-провайдеров.`;

const EXTRACT_PROVIDERS_WITH_CANONICAL_SYSTEM = `Ты — помощник по нормализации названий игровых провайдеров для базы данных. Контекст: онлайн-казино. У одного и того же провайдера на разных сайтах/проектах могут быть разные написания: "Pragmatic Play", "Pragmatic", "PragmaticPlay", "Прагматик Плей" и т.д.

Тебе приходят:
1) Список названий провайдеров, которые УЖЕ ЕСТЬ в нашей базе (канонические названия).
2) Список названий, извлечённых из текста (могут быть сокращения, другой язык, другое написание).

Твоя задача: для КАЖДОГО извлечённого названия решить — это тот же провайдер, что и один из наших (канонических), или новый провайдер?

Правила:
1. Верни ТОЛЬКО JSON-массив строк. Длина массива = количество извлечённых названий (без дублей по смыслу).
2. Для каждого извлечённого названия: если оно ОЧЕВИДНО соответствует одному из канонических (сокращение, аббревиатура, перевод, опечатка, разный регистр) — верни ТОЧНО это каноническое название из нашего списка, без изменений.
3. Если извлечённое название не совпадает ни с одним каноническим — верни его как есть (нормализуй только пробелы), мы создадим нового провайдера.
4. Не дублируй: если несколько извлечённых названий относятся к одному каноническому — в массиве этот канонический должен быть один раз.
5. Никакого текста до или после массива — только валидный JSON.`;

function parseProviderNamesFromResponse(content: string): string[] {
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  const jsonStr = jsonMatch ? jsonMatch[0] : content;
  const parsed = JSON.parse(jsonStr) as unknown;
  if (!Array.isArray(parsed)) return [];
  const names = parsed
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return Array.from(new Set(names));
}

export async function extractProviderNamesFromText(
  rawText: string,
  existingCanonicalNames: string[] = [],
): Promise<string[]> {
  const openai = getClient();
  if (!openai) return [];

  const text = rawText.trim().slice(0, 30000); // limit input size
  if (!text) return [];

  try {
    // Шаг 1: извлечь сырые названия из текста
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: EXTRACT_PROVIDERS_SYSTEM },
        { role: 'user', content: `Извлеки из следующего текста все названия игровых провайдеров и верни только JSON-массив строк.\n\n${text}` },
      ],
      max_tokens: 2000,
      temperature: 0.2,
    });

    const content1 = response.choices[0]?.message?.content?.trim() || '';
    const extracted = parseProviderNamesFromResponse(content1);
    if (extracted.length === 0) return [];

    // Шаг 2: если есть канонический список — нормализовать к нему (использовать наше название, если провайдер тот же)
    if (existingCanonicalNames.length === 0) {
      return extracted;
    }

    const canonicalList = existingCanonicalNames.slice(0, 500).join('\n');
    const extractedList = extracted.join('\n');
    const response2 = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: EXTRACT_PROVIDERS_WITH_CANONICAL_SYSTEM },
        {
          role: 'user',
          content: `Наши провайдеры (канонические названия из базы):\n${canonicalList}\n\nИзвлечённые из текста названия:\n${extractedList}\n\nВерни JSON-массив: для каждого извлечённого — либо точное совпадение из нашего списка, либо название как есть для нового провайдера. Без дублей.`,
        },
      ],
      max_tokens: 2000,
      temperature: 0.1,
    });

    const content2 = response2.choices[0]?.message?.content?.trim() || '';
    return parseProviderNamesFromResponse(content2);
  } catch (error: any) {
    console.error('extractProviderNamesFromText error:', error?.message || error);
    return [];
  }
}
