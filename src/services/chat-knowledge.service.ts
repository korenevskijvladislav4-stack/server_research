import prisma from '../lib/prisma';

// Максимальный общий объём текстового контекста, который отправляем в модель.
// Увеличен по запросу до ~100k символов (реальный лимит всё равно
// ограничен контекстом модели, но этого достаточно для «почти всей» базы).
const MAX_KNOWLEDGE_CHARS = 200_000;
// Локальный лимит на одну секцию, чтобы один большой раздел не «забил» всё.
const MAX_SECTION_CHARS = 50_000;

export interface KnowledgeQueryFilters {
  geo?: string | null;
  casino_id?: number | null;
}

export interface KnowledgeQuery {
  entities: string[];
  filters: KnowledgeQueryFilters;
}

const VALID_ENTITIES = new Set([
  'casinos',
  'bonuses',
  'payments',
  'promos',
  'providers',
  'casino_providers',
  'emails',
  'geos',
  'casino_tags',
  'comments',
]);

function truncateSection(text: string, max = MAX_SECTION_CHARS): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '\n[... обрезано ...]';
}

function push(
  sections: string[],
  title: string,
  lines: string[] | Record<string, unknown>[],
  maxChars = MAX_SECTION_CHARS,
) {
  const text =
    Array.isArray(lines) && lines.length > 0
      ? (lines as string[]).join('\n')
      : (lines as Record<string, unknown>[]).map((o) => JSON.stringify(o)).join('\n');
  if (text) sections.push(`## ${title}\n${truncateSection(text, maxChars)}`);
}

/**
 * Собирает контекст только по запрошенным сущностям и фильтрам (точечные запросы).
 */
export async function buildTargetedKnowledgeContext(query: KnowledgeQuery): Promise<string> {
  const { entities, filters } = query;
  const geo = filters.geo ?? undefined;
  const casinoId = filters.casino_id ?? undefined;
  const sections: string[] = [];

  const need = (name: string) => entities.includes(name);

  if (need('geos')) {
    const geos = await prisma.geos.findMany({
      select: { code: true, name: true },
      orderBy: { code: 'asc' },
    });
    push(sections, 'GEO', geos.map((g) => `${g.code}: ${g.name}`), 800);
  }

  if (need('casinos')) {
    const where: { id?: number } = {};
    if (casinoId != null) where.id = casinoId;
    const casinos = await prisma.casinos.findMany({
      where,
      select: { id: true, name: true, website: true, geo: true, is_our: true, status: true, description: true },
      orderBy: { name: 'asc' },
      take: casinoId != null ? 1 : 500,
    });
    push(
      sections,
      'Казино',
      casinos.map((c) => {
        const geoStr =
          c.geo != null ? (Array.isArray(c.geo) ? (c.geo as string[]).join(', ') : String(c.geo)) : '';
        return `${c.name} | сайт: ${c.website ?? '—'} | GEO: ${geoStr} | наш: ${c.is_our ?? false} | статус: ${c.status ?? '—'}${
          c.description ? ` | описание: ${String(c.description).slice(0, 200)}` : ''
        }`;
      }),
    );
  }

  if (need('bonuses')) {
    const where: { casino_id?: number; geo?: string } = {};
    if (casinoId != null) where.casino_id = casinoId;
    if (geo) where.geo = geo;
    const bonuses = await prisma.casino_bonuses.findMany({
      where,
      include: {
        casinos: { select: { name: true } },
      },
      orderBy: [{ casino_id: 'asc' }, { geo: 'asc' }],
      take: 800,
    });
    push(
      sections,
      'Бонусы (сводка)',
      bonuses.map((b) => {
        const casinoName = b.casinos?.name ?? 'Казино без названия (id скрыт)';
        const monetaryPart =
          b.bonus_value != null && b.bonus_unit
            ? `${b.bonus_value.toString()} ${
                b.bonus_unit === 'percent' ? '%' : b.currency ?? ''
              }`
            : null;
        const freespinPart =
          b.freespins_count != null
            ? `${b.freespins_count} фриспинов${
                b.freespin_value != null ? ` по ${b.freespin_value.toString()} ${b.currency ?? ''}` : ''
              }${b.freespin_game ? ` в игре ${b.freespin_game}` : ''}`
            : null;
        const combinedValue = [monetaryPart, freespinPart].filter(Boolean).join(' + ');
        const valuePart =
          combinedValue ||
          (b.cashback_percent != null
            ? `кэшбэк ${b.cashback_percent.toString()}%`
            : '—');
        const minDep = b.min_deposit != null ? `${b.min_deposit.toString()} ${b.currency ?? ''}` : '—';
        const maxBonus = b.max_bonus != null ? `${b.max_bonus.toString()} ${b.currency ?? ''}` : '—';
        const wageringMoney =
          b.wagering_requirement != null ? `${b.wagering_requirement.toString()}x` : 'не указано';
        const wageringFreespin =
          b.wagering_freespin != null ? `${b.wagering_freespin.toString()}x` : 'не указано';
        const wageringGames = b.wagering_games ?? 'не указано';
        const wageringTimeLimit = b.wagering_time_limit ?? 'не указано';
        const period =
          b.valid_from || b.valid_to
            ? `${b.valid_from ? new Date(b.valid_from).toISOString().slice(0, 10) : '—'} → ${
                b.valid_to ? new Date(b.valid_to).toISOString().slice(0, 10) : '—'
              }`
            : '—';
        const promo = b.promo_code ?? '—';
        const notes = b.notes ? String(b.notes).slice(0, 160) : '';

        return [
          casinoName,
          `"${b.name}"`,
          `GEO: ${b.geo}`,
          `категория: ${b.bonus_category ?? '—'}`,
          `вид: ${b.bonus_kind ?? '—'}`,
          `тип: ${b.bonus_type ?? '—'}`,
          `значение: ${valuePart}`,
          `мин. депозит: ${minDep}`,
          `макс. бонус: ${maxBonus}`,
          `вейджер (деньги/бонус): ${wageringMoney}`,
          `вейджер фриспинов: ${wageringFreespin}`,
          `игры для отыгрыша: ${wageringGames}`,
          `лимит времени отыгрыша: ${wageringTimeLimit}`,
          `промокод: ${promo}`,
          `период: ${period}`,
          `статус: ${b.status ?? '—'}`,
          notes ? `заметки: ${notes}` : '',
        ]
          .filter(Boolean)
          .join(' | ');
      }),
    );
  }

  if (need('payments')) {
    const where: { casino_id?: number; geo?: string } = {};
    if (casinoId != null) where.casino_id = casinoId;
    if (geo) where.geo = geo;
    const payments = await prisma.casino_payments.findMany({
      where,
      include: {
        casinos: { select: { name: true } },
      },
      orderBy: [{ casino_id: 'asc' }, { geo: 'asc' }],
      take: 600,
    });
    push(
      sections,
      'Платёжные методы',
      payments.map((p) => {
        const casinoName = p.casinos?.name ?? 'Казино без названия (id скрыт)';
        const minAmount = p.min_amount != null ? `${p.min_amount.toString()} ${p.currency ?? ''}` : '—';
        const maxAmount = p.max_amount != null ? `${p.max_amount.toString()} ${p.currency ?? ''}` : '—';
        const notes = p.notes ? String(p.notes).slice(0, 160) : '';
        return [
          casinoName,
          `GEO: ${p.geo}`,
          `направление: ${p.direction}`,
          `тип: ${p.type}`,
          `метод: ${p.method}`,
          `мин. сумма: ${minAmount}`,
          `макс. сумма: ${maxAmount}`,
          notes ? `заметки: ${notes}` : '',
        ]
          .filter(Boolean)
          .join(' | ');
      }),
    );
  }

  if (need('promos')) {
    const where: { casino_id?: number; geo?: string } = {};
    if (casinoId != null) where.casino_id = casinoId;
    if (geo) where.geo = geo;
    const promos = await prisma.casino_promos.findMany({
      where,
      include: {
        casinos: { select: { name: true } },
      },
      orderBy: [{ casino_id: 'asc' }],
      take: 400,
    });
    push(
      sections,
      'Промо/турниры',
      promos.map((p) => {
        const casinoName = p.casinos?.name ?? 'Казино без названия (id скрыт)';
        const period =
          p.period_start || p.period_end
            ? `${p.period_start ? new Date(p.period_start).toISOString().slice(0, 10) : '—'} → ${
                p.period_end ? new Date(p.period_end).toISOString().slice(0, 10) : '—'
              }`
            : '—';
        const mechanics = p.mechanics ? String(p.mechanics).slice(0, 160) : '';
        const prize = p.prize_fund ?? '—';
        const minBet = p.min_bet ?? '—';
        const wageringPrize = p.wagering_prize ?? '—';

        return [
          casinoName,
          `"${p.name}"`,
          `GEO: ${p.geo}`,
          `категория: ${p.promo_category}`,
          p.promo_type ? `тип промо: ${p.promo_type}` : '',
          `призовой фонд: ${prize}`,
          `минимальная ставка: ${minBet}`,
          `вейджер приза: ${wageringPrize}`,
          `период: ${period}`,
          `статус: ${p.status ?? '—'}`,
          mechanics ? `механика: ${mechanics}` : '',
        ]
          .filter(Boolean)
          .join(' | ');
      }),
    );
  }

  if (need('providers')) {
    const providers = await prisma.providers.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    push(sections, 'Провайдеры (игровые)', providers.map((p) => p.name), 2000);
  }

  if (need('casino_providers')) {
    const where: { casino_id?: number; geo?: string } = {};
    if (casinoId != null) where.casino_id = casinoId;
    if (geo) where.geo = geo;
    const links = await prisma.casino_providers.findMany({
      where,
      include: {
        casinos: { select: { name: true } },
        providers: { select: { name: true } },
      },
      take: 1500,
    });
    push(
      sections,
      'Подключение провайдеров к казино',
      links.map((l) => {
        const casinoName = l.casinos?.name ?? 'Казино без названия (id скрыт)';
        const providerName = l.providers?.name ?? 'Провайдер без названия (id скрыт)';
        return `${casinoName} — провайдер: ${providerName}${l.geo ? ` (GEO: ${l.geo})` : ''}`;
      }),
      // Для подключений провайдеров важен полный список, поэтому не режем секцию локальным лимитом.
      MAX_KNOWLEDGE_CHARS,
    );
  }

  if (need('emails')) {
    const where: { related_casino_id?: number } = {};
    if (casinoId != null) where.related_casino_id = casinoId;
    const emails = await prisma.emails.findMany({
      where,
      select: { id: true, subject: true, date_received: true, ai_summary: true, related_casino_id: true },
      orderBy: { date_received: 'desc' },
      take: 300,
    });
    push(
      sections,
      'Письма (тема, дата, саммари, related_casino_id)',
      emails.map((e) => {
        const date = e.date_received ? new Date(e.date_received).toISOString().slice(0, 10) : '—';
        const subject = (e.subject ?? '').slice(0, 80);
        const summary = e.ai_summary ? String(e.ai_summary).slice(0, 150) : '';
        return `Письмо от ${date} | тема: ${subject}${summary ? ` | саммари: ${summary}` : ''}`;
      }),
    );
  }

  if (need('casino_tags')) {
    const where = casinoId != null ? { casino_id: casinoId } : {};
    const casinoTags = await prisma.casino_tags.findMany({
      where,
      include: { casinos: { select: { name: true } }, tags: { select: { name: true } } },
      take: 500,
    });
    push(
      sections,
      'Теги казино',
      casinoTags.map((ct) => `${ct.casinos.name} — тег: ${ct.tags.name}`),
    );
  }

  if (need('comments')) {
    const where = casinoId != null ? { casino_id: casinoId } : {};
    const comments = await prisma.casino_comments.findMany({
      where,
      include: { casinos: { select: { name: true } } },
      orderBy: { created_at: 'desc' },
      take: 200,
    });
    push(
      sections,
      'Комментарии к казино',
      comments.map((c) => {
        const date = c.created_at ? new Date(c.created_at).toISOString().slice(0, 10) : '—';
        const casinoName = c.casinos?.name ?? 'Казино без названия (id скрыт)';
        return `Казино: ${casinoName} | комментарий от ${date}: ${String(c.text).slice(0, 300)}`;
      }),
    );
  }

  let out = sections.length > 0 ? sections.join('\n\n') : 'Нет данных по выбранным сущностям.';
  if (out.length > MAX_KNOWLEDGE_CHARS) {
    out = out.slice(0, MAX_KNOWLEDGE_CHARS) + '\n\n[... контекст обрезан по лимиту ...]';
  }
  return out;
}

/**
 * Нормализует и валидирует ответ классификатора.
 */
export function normalizeKnowledgeQuery(raw: unknown): KnowledgeQuery {
  const filters: KnowledgeQueryFilters = {};
  let entities: string[] = [];

  if (raw && typeof raw === 'object' && 'entities' in raw && Array.isArray((raw as any).entities)) {
    entities = (raw as any).entities
      .filter((e: unknown) => typeof e === 'string' && VALID_ENTITIES.has(e as string)) as string[];
  }
  if (raw && typeof raw === 'object' && 'filters' in raw && (raw as any).filters && typeof (raw as any).filters === 'object') {
    const f = (raw as any).filters;
    if (typeof f.geo === 'string' && f.geo.trim()) filters.geo = f.geo.trim();
    else if (f.geo === null || f.geo === undefined) filters.geo = null;
    if (typeof f.casino_id === 'number') filters.casino_id = f.casino_id;
    else if (f.casino_id === null || f.casino_id === undefined) filters.casino_id = null;
  }

  if (entities.includes('providers') && !entities.includes('casino_providers')) {
    entities.push('casino_providers');
  }
  if (entities.includes('casino_providers') && !entities.includes('providers')) {
    entities.push('providers');
  }

  if (entities.length === 0) {
    entities = ['geos', 'casinos'];
  }
  return { entities, filters };
}

/**
 * Собирает максимально полный контекст по всем доступным сущностям (без чувствительных данных).
 */
export async function buildFullKnowledgeContext(): Promise<string> {
  return buildTargetedKnowledgeContext({
    entities: Array.from(VALID_ENTITIES),
    filters: {},
  });
}
