import prisma from '../../lib/prisma';
import {
  buildFullKnowledgeContext,
  buildTargetedKnowledgeContext,
  normalizeKnowledgeQuery,
  type KnowledgeQuery,
} from './chat-knowledge.service';
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
- Если данных недостаточно для однозначного ответа, чётко разделяй ответ на две части:
  - **"Что известно по данным"** — всё, что можно уверенно сказать на основе контекста.
  - **"Чего не хватает для точного вывода"** — какие именно данные потребовались бы (по каким казино, GEO, провайдерам, типам сущностей).
- Можно и нужно делать выводы, сравнения и рекомендации на основе приведённых данных, но всегда показывай, на каких строках/фактах это основано.
- При поиске провайдера или казино по названию используй нечёткое/частичное совпадение: если пользователь пишет "Pragmatic", а в данных есть "Pragmatic Play", считай это совпадением (если нужно, явно объясни, что имя совпадает частично).`;

const KNOWLEDGE_CLASSIFIER_PROMPT = `Ты — помощник, который решает, КАКИЕ данные из исследовательской CRM по онлайн-казино нужны для ответа на вопрос.

Тебе дают:
- текущий вопрос пользователя;
- (опционально) несколько последних сообщений диалога.

Твоя задача — вернуть JSON-объект с двумя полями:
{
  "entities": string[],
  "filters": {
    "geo": string | null,
    "casino_id": number | null
  }
}

Пояснения:
- "entities" — какие сущности БД нужны для ответа. Допустимые значения смотри в описании (casinos, bonuses, payments, promos, providers, casino_providers, emails, geos, casino_tags, comments).
- "filters.geo" — какой GEO (страна/код) наиболее релевантен вопросу, либо null, если GEO не задан.
- "filters.casino_id" — конкретное казино по внутреннему id, если в вопросе ЯВНО указан конкретный объект с известным id (обычно у нас нет этой информации, поэтому чаще всего null).

Правила:
- Отвечай ТОЛЬКО валидным JSON без пояснительного текста.
- Если вопрос общий (например "сравни бонусы в разных казино"), выбери несколько ключевых сущностей (например casinos, bonuses, payments, providers).
- Если вопрос про геймификацию, игровые фичи, квесты, уровни, ачивки, прогресс, челленджи, задания или мотивацию игроков — ОБЯЗАТЕЛЬНО включи "comments" в entities, так как в комментариях описаны такие механики.
- Если вопрос про конкретное казино по названию, постарайся это отразить в filters.casino_id только если в сообщениях прямым текстом указан id. Если id не указан — оставь casino_id: null.
- Если вопрос или история недостаточно конкретны, можно ограничиться базовым набором: ["geos", "casinos"].
- Игнорируй внутреннюю историю, если она не помогает определить фильтры/сущности.`;

async function buildKnowledgeContextForQuestion(
  userContent: string,
  history: { role: string; content: string }[],
): Promise<string> {
  const openai = getOpenAI();

  // Если нет настроенного клиента — откатываемся к полному контексту, чтобы чат всё равно работал.
  if (!openai) {
    return buildFullKnowledgeContext();
  }

  let query: KnowledgeQuery = { entities: [], filters: {} };

  try {
    const historySnippet = history.slice(-4);
    const historyText =
      historySnippet.length > 0
        ? historySnippet
            .map((m) => `${m.role === 'user' ? 'user' : 'assistant'}: ${m.content}`)
            .join('\n')
        : '';

    const classifierUserContent = [
      historyText ? 'Последние сообщения диалога:' : '',
      historyText,
      historyText ? '\n---\n' : '',
      'Текущий вопрос пользователя:',
      userContent,
    ]
      .filter(Boolean)
      .join('\n');

    const classifierResponse = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: KNOWLEDGE_CLASSIFIER_PROMPT },
        { role: 'user', content: classifierUserContent },
      ],
      max_tokens: 300,
      temperature: 0.1,
    });

    const raw = classifierResponse.choices[0]?.message?.content ?? '';
    const parsed = JSON.parse(raw);
    query = normalizeKnowledgeQuery(parsed);
  } catch {
    // В случае любой ошибки классификатора используем дефолтное поведение.
    query = normalizeKnowledgeQuery({});
  }

  // Гарантируем наличие комментариев в контексте для вопросов о геймификации и похожих темах.
  const textForHeuristics = (userContent + ' ' + history.map((h) => h.content).join(' ')).toLowerCase();
  const gamificationKeywords = [
    'геймификац',
    'квест',
    'ачивк',
    'уровн',
    'левел',
    'прогресс',
    'мисси',
    'челлендж',
    'challenge',
    'задани',
    'quests',
    'gamification',
  ];
  if (gamificationKeywords.some((kw) => textForHeuristics.includes(kw))) {
    if (!query.entities.includes('comments')) {
      query.entities.push('comments');
    }
  }

  // Строим таргетированный контекст по выбранным сущностям/фильтрам.
  return buildTargetedKnowledgeContext(query);
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
          // Увеличенный лимит токенов, чтобы ответы не обрывались.
          max_tokens: 2500,
          temperature: 0.2,
        });
        assistantText = response.choices[0]?.message?.content?.trim() ?? assistantText;
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

