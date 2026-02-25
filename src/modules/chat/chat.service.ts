import prisma from '../../lib/prisma';
import { buildFullKnowledgeContext } from './chat-knowledge.service';
import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI | null {
  if (openaiClient) return openaiClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  openaiClient = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1',
  });
  return openaiClient;
}

// Простой in-memory кэш полного контекста, чтобы не собирать его из БД на каждый запрос.
let knowledgeCache: { value: string; builtAt: number } | null = null;
const KNOWLEDGE_TTL_MS = 5 * 60 * 1000; // 5 минут

const SYSTEM_PROMPT = `Ты — аналитик исследовательской CRM по онлайн-казино. Тебе даётся контекст в виде структурированных данных из базы (казино, бонусы, платежи, провайдеры, письма, промо, подключения провайдеров, комментарии и т.д.).

Твоя задача — давать развёрнутые, максимально точные и корректные ответы на вопросы пользователя, опираясь ТОЛЬКО на эти данные.

Требования к форме ответа (как в ChatGPT):
- Отвечай на русском языке.
- ВСЕГДА используй Markdown-форматирование.
- Структура ответа по умолчанию:
  1) Блок **"Краткий вывод"** — 1–3 предложения с самой важной мыслью.
  2) Блок **"Подробности"** или тематические заголовки второго уровня (## / ###) с разбором по пунктам.
- Для списков используй маркированные и нумерованные списки, подсвечивай важные термины через **жирный текст**.

Требования к содержанию и работе с данными:
- Всегда опирайся только на контекст, который тебе передан, не используй внешние знания.
- Если в контексте есть хоть какие‑то релевантные строки по вопросу, обязательно используй их и явно объясняй, на каких данных основан вывод (ссылайся на названия казино и провайдеров, GEO, наличие/отсутствие записей и т.п.), но НЕ упоминай внутренние числовые идентификаторы (id).
- Старайся ссылаться на названия секций контекста (например, "Казино", "Бонусы (сводка)", "Платёжные методы", "Письма (тема, дата, саммари...)", "Подключение провайдеров к казино", "Комментарии к казино" и т.д.), по возможности указывая характерные строки, на которых основан вывод.
- Помни, что записи в секции "Комментарии к казино" всегда привязаны к конкретным казино: используй их как источник фактов о геймификации, фичах, проблемах и сильных сторонах этих казино.
- Не придумывай факты и не ссылайся на внешние источники — только на данные из контекста. Если чего-то нет в контексте, честно так и говори.
- Когда перечисляешь бонусы, промо или платёжные методы по казино, используй для каждого пункта ОДНУ и ту же структуру полей (например: казино, GEO, категория/вид/тип, значение, мин. депозит, макс. бонус, вейджер, промокод, период, статус). Если по какому‑то полю данных нет, НЕ пропускай его молча — пиши явно "не указано" или "нет данных".
- Старайся не делать ответы чрезмерно длинными: если по вопросу затронуто много казино или сущностей, сначала дай общую сводку (краткий перечень или таблицу), а детально распиши только явно запрошенные проекты или 3–5 самых показательных примеров. Остальные казино/сущности опиши кратко (1–2 предложения) или объедини по общим паттернам, чтобы уложиться в разумный объём ответа.
- Если данных недостаточно для однозначного ответа, чётко разделяй ответ на две части:
  - **"Что известно по данным"** — всё, что можно уверенно сказать на основе контекста.
  - При работе с бонусами, не передавай информацию, которая не относится к тому или иному типу бонусов к примеру если информация по кэш бонусу - не возвращай информацию по вейджеру на фриспины и т.д. + н передавай информацию по пустым полям. Нужна лишь основная информация по бонусу.
  - **"Чего не хватает для точного вывода"** — какие именно данные потребовались бы (по каким казино, GEO, провайдерам, типам сущностей).
- Можно и нужно делать выводы, сравнения и рекомендации на основе приведённых данных, но всегда показывай, на каких строках/фактах это основано.
- При поиске провайдера или казино по названию используй нечёткое/частичное совпадение: если пользователь пишет "Pragmatic", а в данных есть "Pragmatic Play", считай это совпадением (если нужно, явно объясни, что имя совпадает частично).`;

async function buildKnowledgeContextForQuestion(
  _userContent: string,
  _history: { role: string; content: string }[],
): Promise<string> {
  // Используем максимально полный контекст по базе (без чувствительных данных),
  // но кэшируем его в памяти, чтобы не дергать БД на каждый запрос.
  const now = Date.now();
  if (knowledgeCache && now - knowledgeCache.builtAt < KNOWLEDGE_TTL_MS) {
    return knowledgeCache.value;
  }

  const knowledge = await buildFullKnowledgeContext();
  knowledgeCache = { value: knowledge, builtAt: now };
  return knowledge;
}

const db = prisma as any;

export const chatService = {
  async listSessions(userId: number) {
    return db.chat_sessions.findMany({
      where: { user_id: userId },
      orderBy: { updated_at: 'desc' },
      select: { id: true, title: true, created_at: true, updated_at: true },
    });
  },

  async createSession(userId: number, title?: string | null) {
    return db.chat_sessions.create({
      data: {
        user_id: userId,
        title: title ?? null,
      },
    });
  },

  async getSessionWithMessages(sessionId: number, userId: number) {
    const session = await db.chat_sessions.findFirst({
      where: { id: sessionId, user_id: userId },
      include: {
        chat_messages: {
          orderBy: { created_at: 'asc' },
          select: { id: true, role: true, content: true, created_at: true },
        },
      },
    });
    return session;
  },

  async deleteSession(sessionId: number, userId: number) {
    await db.chat_sessions.deleteMany({
      where: { id: sessionId, user_id: userId },
    });
  },

  async addMessageAndReply(
    sessionId: number,
    userId: number,
    userContent: string,
  ): Promise<{
    userMessage: { id: number; role: string; content: string; created_at: Date | null };
    assistantMessage: { id: number; role: string; content: string; created_at: Date | null };
  }> {
    const session = await db.chat_sessions.findFirst({
      where: { id: sessionId, user_id: userId },
      include: {
        chat_messages: { orderBy: { created_at: 'asc' }, select: { role: true, content: true } },
      },
    });
    if (!session) throw new Error('Chat session not found');

    const userMsg = await db.chat_messages.create({
      data: {
        chat_session_id: sessionId,
        role: 'user',
        content: userContent,
      },
    });

    const openai = getOpenAI();
    let assistantText = 'Не удалось получить ответ: сервис ИИ не настроен (OPENAI_API_KEY).';
    if (openai) {
      try {
        const history = session.chat_messages.slice(-12);
        const knowledge = await buildKnowledgeContextForQuestion(userContent, history);
        const messages: OpenAI.ChatCompletionMessageParam[] = [
          {
            role: 'system',
            content:
              SYSTEM_PROMPT +
              '\n\n---\nКонтекст из базы данных (только на основе этих данных отвечай на вопросы):\n\n' +
              knowledge,
          },
          ...history.map((m: { role: string; content: string }) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
          { role: 'user', content: userContent },
        ];

        const response = await openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'openai/gpt-4o-mini',
          messages,
          // Максимально большой лимит токенов для длинных аналитических ответов.
          max_tokens: 20000,
          temperature: 0.2,
        });

        const choice = response.choices[0];
        const rawContent = choice?.message?.content ?? '';
        const trimmed = rawContent.trim();

        if (!trimmed) {
          // Модель вернула пустой ответ — показываем понятное сообщение вместо "пустоты".
          assistantText =
            'Не удалось сформировать ответ на основе доступного контекста. Попробуйте переформулировать вопрос или уточнить, какие именно данные вас интересуют.';
        } else {
          assistantText = trimmed;

          // Если ответ был обрезан по лимиту токенов, явно сообщаем об этом пользователю.
          if ((choice as any).finish_reason === 'length') {
            assistantText +=
              '\n\n_(Ответ был обрезан по лимиту длины модели. Если нужно, задай уточняющий вопрос или попроси продолжить анализ.)_';
          }
        }
      } catch (e: unknown) {
        const err = e as Error;
        assistantText = `Ошибка при запросе к ИИ: ${err?.message ?? String(e)}`;
      }
    }

    const assistantMsg = await db.chat_messages.create({
      data: {
        chat_session_id: sessionId,
        role: 'assistant',
        content: assistantText,
      },
    });

    await db.chat_sessions.update({
      where: { id: sessionId },
      data: { updated_at: new Date() },
    });

    const firstUserMsg = session.chat_messages.length === 0 && userContent;
    if (firstUserMsg) {
      const title = String(userContent).slice(0, 80).trim();
      await db.chat_sessions.update({
        where: { id: sessionId },
        data: { title: title || 'Новый чат' },
      });
    }

    return {
      userMessage: {
        id: userMsg.id,
        role: userMsg.role,
        content: userMsg.content,
        created_at: userMsg.created_at,
      },
      assistantMessage: {
        id: assistantMsg.id,
        role: assistantMsg.role,
        content: assistantMsg.content,
        created_at: assistantMsg.created_at,
      },
    };
  },
};

