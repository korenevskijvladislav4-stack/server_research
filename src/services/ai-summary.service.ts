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
