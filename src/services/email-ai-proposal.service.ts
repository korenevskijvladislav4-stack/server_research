import path from 'path';
import fs from 'fs';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { screenshotEmail } from './email-screenshot.service';
import { extractBonusFromImage } from './ai-bonus-from-image.service';
import { extractPromoFromImage } from './ai-promo-from-image.service';
import { casinoBonusService } from '../modules/casinoBonus/casinoBonus.service';
import { casinoPromoService } from '../modules/casinoPromo/casinoPromo.service';
import { AppError } from '../errors/AppError';

const SCREENSHOTS_DIR = path.resolve(__dirname, '../../uploads/email-screenshots');
const uploadsRoot = path.resolve(__dirname, '../../uploads');

/** GEO ящика получателя — как в списке писем (JOIN casino_accounts по to_email + related_casino_id). */
async function fetchEmailGeosByIds(emailIds: number[]): Promise<Map<number, string | null>> {
  const map = new Map<number, string | null>();
  const uniq = [...new Set(emailIds.filter((id) => id > 0))];
  if (uniq.length === 0) return map;
  const rows = await prisma.$queryRaw<{ id: bigint | number; geo: string | null }[]>(
    Prisma.sql`
      SELECT e.id, ca.geo AS geo
      FROM emails e
      LEFT JOIN casino_accounts ca ON ca.email = e.to_email AND ca.casino_id = e.related_casino_id
      WHERE e.id IN (${Prisma.join(uniq)})
    `,
  );
  for (const r of rows) {
    map.set(Number(r.id), r.geo);
  }
  return map;
}

/** ID писем, у которых GEO ящика (casino_accounts) совпадает с кодом. */
async function findEmailIdsByMailboxGeo(geoUpper: string): Promise<number[]> {
  const g = geoUpper.trim().toUpperCase().slice(0, 10);
  if (!g) return [];
  const rows = await prisma.$queryRaw<{ id: bigint | number }[]>(
    Prisma.sql`
      SELECT DISTINCT e.id
      FROM emails e
      INNER JOIN casino_accounts ca ON ca.email = e.to_email AND ca.casino_id = e.related_casino_id
      WHERE ca.geo IS NOT NULL AND UPPER(TRIM(ca.geo)) = ${g}
    `,
  );
  return rows.map((r) => Number(r.id));
}

function attachEmailGeo<T extends { email_id: number; emails: Record<string, unknown> | null }>(
  row: T,
  geoByEmail: Map<number, string | null>,
): T {
  const g = geoByEmail.get(row.email_id) ?? null;
  if (!row.emails) return row;
  return {
    ...row,
    emails: { ...row.emails, geo: g },
  };
}

function firstGeoFromCasinoGeo(geo: unknown): string | null {
  if (geo == null) return null;
  if (typeof geo === 'object' && !Array.isArray(geo)) {
    const keys = Object.keys(geo as Record<string, unknown>);
    return keys.length ? String(keys[0]).toUpperCase().slice(0, 10) : null;
  }
  return null;
}

async function guessCasinoIdByName(name: string | null | undefined): Promise<number | null> {
  if (!name?.trim()) return null;
  const n = name.trim().toLowerCase();
  const casinos = await prisma.casinos.findMany({ select: { id: true, name: true } });
  const exact = casinos.find((c) => c.name.toLowerCase() === n);
  if (exact) return exact.id;
  const contains = casinos.find(
    (c) => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase()),
  );
  return contains?.id ?? null;
}

function buildEmailTextSnippet(email: {
  subject: string | null;
  from_name: string | null;
  from_email: string | null;
  body_text: string | null;
  body_html: string | null;
}): string {
  const body = email.body_text || (email.body_html ? email.body_html.replace(/<[^>]+>/g, ' ') : '');
  const short = body.replace(/\s+/g, ' ').trim().slice(0, 3500);
  return [
    `Тема: ${email.subject ?? ''}`,
    `От: ${email.from_name ?? ''} <${email.from_email ?? ''}>`,
    '',
    short || '(пусто)',
  ].join('\n');
}

function copyEmailScreenshotToSubdir(
  screenshotUrl: string | null,
  proposalId: number,
  subdir: 'bonuses' | 'promos',
): string | null {
  if (!screenshotUrl) return null;
  const m = screenshotUrl.match(/email-screenshots\/([^/?#]+)/);
  if (!m) return null;
  const src = path.join(SCREENSHOTS_DIR, m[1]);
  if (!fs.existsSync(src)) return null;
  const destDir = path.join(uploadsRoot, subdir);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const destName = `from-email-proposal-${proposalId}-${Date.now()}.png`;
  const destAbs = path.join(destDir, destName);
  fs.copyFileSync(src, destAbs);
  return path.join(subdir, destName).replace(/\\/g, '/');
}

/** Вызывается после присвоения письму темы с ai_target bonus/promo */
export async function tryCreateEmailAiProposal(
  emailId: number,
  topicId: number,
  target: 'bonus' | 'promo',
): Promise<void> {
  const existing = await prisma.ai_email_proposals.findUnique({
    where: {
      email_id_proposal_type: { email_id: emailId, proposal_type: target },
    },
  });
  if (existing) return;

  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.warn(`[AiEmailProposal] email ${emailId}: OPENAI_API_KEY не задан — создаю карточку с ошибкой`);
    const emailBare = await prisma.emails.findUnique({
      where: { id: emailId },
      select: { related_casino_id: true },
    });
    await prisma.ai_email_proposals.create({
      data: {
        email_id: emailId,
        topic_id: topicId,
        proposal_type: target,
        status: 'pending',
        payload_json: {},
        error_message: 'На сервере не задан OPENAI_API_KEY — ИИ недоступен.',
        suggested_casino_id: emailBare?.related_casino_id ?? null,
      },
    });
    return;
  }

  await screenshotEmail(emailId);

  const email = await prisma.emails.findUnique({
    where: { id: emailId },
    include: { casinos: { select: { id: true, name: true, geo: true } } },
  });
  if (!email) {
    console.warn(`[AiEmailProposal] email ${emailId}: письмо не найдено в БД`);
    return;
  }

  const hintGeoEarly = firstGeoFromCasinoGeo(email.casinos?.geo) ?? null;

  const url = email.screenshot_url;
  if (!url) {
    console.warn(`[AiEmailProposal] No screenshot for email ${emailId} after render, type ${target}`);
    await prisma.ai_email_proposals.create({
      data: {
        email_id: emailId,
        topic_id: topicId,
        proposal_type: target,
        status: 'pending',
        payload_json: {},
        error_message:
          'Нет скриншота письма. Проверьте, что в письме есть текст/HTML; откройте письмо и нажмите «Скриншот», затем «Предложение ИИ» (или пересоздайте с force).',
        suggested_geo: hintGeoEarly,
        suggested_casino_id: email.related_casino_id ?? null,
      },
    });
    return;
  }

  const filenameMatch = url.match(/email-screenshots\/([^/?#]+)/);
  if (!filenameMatch) {
    console.warn(`[AiEmailProposal] email ${emailId}: некорректный URL скрина: ${url}`);
    await prisma.ai_email_proposals.create({
      data: {
        email_id: emailId,
        topic_id: topicId,
        proposal_type: target,
        status: 'pending',
        payload_json: {},
        error_message: `Некорректный путь скриншота в БД. Ожидался …/email-screenshots/…, получено: ${url.slice(0, 120)}`,
        suggested_geo: hintGeoEarly,
        suggested_casino_id: email.related_casino_id ?? null,
      },
    });
    return;
  }
  const diskPath = path.join(SCREENSHOTS_DIR, filenameMatch[1]);
  if (!fs.existsSync(diskPath)) {
    console.warn(`[AiEmailProposal] File missing: ${diskPath}`);
    await prisma.ai_email_proposals.create({
      data: {
        email_id: emailId,
        topic_id: topicId,
        proposal_type: target,
        status: 'pending',
        payload_json: {},
        error_message: `Файл скриншота не найден на диске (${filenameMatch[1]}). Сделайте скрин заново из просмотра письма.`,
        suggested_geo: hintGeoEarly,
        suggested_casino_id: email.related_casino_id ?? null,
      },
    });
    return;
  }

  const hintGeo = firstGeoFromCasinoGeo(email.casinos?.geo) ?? undefined;
  const emailCtx = buildEmailTextSnippet(email);

  let payload: Record<string, unknown> | null = null;
  try {
    if (target === 'bonus') {
      payload = await extractBonusFromImage(diskPath, 'image/png', {
        geo: hintGeo ?? null,
        emailText: emailCtx,
      });
    } else {
      payload = await extractPromoFromImage(diskPath, 'image/png', {
        geo: hintGeo ?? null,
        emailText: emailCtx,
      });
    }
  } catch (e: any) {
    console.error(`[AiEmailProposal] AI error email ${emailId}:`, e?.message || e);
  }

  if (!payload) {
    await prisma.ai_email_proposals.create({
      data: {
        email_id: emailId,
        topic_id: topicId,
        proposal_type: target,
        status: 'pending',
        payload_json: {},
        error_message: 'ИИ не вернул данные',
        suggested_geo: hintGeo,
        suggested_casino_id: email.related_casino_id ?? null,
      },
    });
    return;
  }

  const casinoName =
    (typeof payload.casino_name === 'string' && payload.casino_name) ||
    (typeof payload.casino === 'string' && payload.casino) ||
    email.casinos?.name ||
    null;
  const aiGeo =
    typeof payload.geo === 'string' ? payload.geo.slice(0, 10).toUpperCase() : hintGeo || null;
  const suggestedCasino =
    (await guessCasinoIdByName(casinoName)) ?? email.related_casino_id ?? null;

  await prisma.ai_email_proposals.create({
    data: {
      email_id: emailId,
      topic_id: topicId,
      proposal_type: target,
      status: 'pending',
      payload_json: payload as object,
      suggested_casino_id: suggestedCasino,
      suggested_geo: aiGeo,
      casino_name_guess: casinoName,
    },
  });
}

export const aiEmailProposalService = {
  async list(
    /** true — только просмотренные, false — только непросмотренные, null — все */
    viewed: boolean | null,
    proposalType?: 'bonus' | 'promo',
    opts?: { geo?: string | string[]; casino_id?: number },
  ) {
    const andParts: Prisma.ai_email_proposalsWhereInput[] = [];
    if (viewed !== null) {
      andParts.push({ viewed_at: viewed ? { not: null } : null });
    }
    if (proposalType) {
      andParts.push({ proposal_type: proposalType });
    }
    if (opts?.casino_id != null && opts.casino_id > 0) {
      const cid = opts.casino_id;
      andParts.push({
        OR: [{ suggested_casino_id: cid }, { emails: { related_casino_id: cid } }],
      });
    }
    const geoArr = opts?.geo
      ? (Array.isArray(opts.geo) ? opts.geo : [opts.geo]).map((g) => g.trim().toUpperCase().slice(0, 10)).filter(Boolean)
      : [];
    if (geoArr.length > 0) {
      const emailIdSets = await Promise.all(geoArr.map((g) => findEmailIdsByMailboxGeo(g)));
      const allEmailIds = [...new Set(emailIdSets.flat())];
      const geoOr: Prisma.ai_email_proposalsWhereInput[] = [
        { suggested_geo: geoArr.length === 1 ? geoArr[0] : { in: geoArr } },
      ];
      if (allEmailIds.length > 0) {
        geoOr.push({ email_id: { in: allEmailIds } });
      }
      andParts.push({ OR: geoOr });
    }

    const rows = await prisma.ai_email_proposals.findMany({
      where: { AND: andParts },
      orderBy: { created_at: 'desc' },
      take: 300,
      include: {
        emails: {
          select: {
            id: true,
            subject: true,
            date_received: true,
            screenshot_url: true,
            from_email: true,
            from_name: true,
            to_email: true,
          },
        },
        email_topics: { select: { id: true, name: true } },
        casinos: { select: { id: true, name: true } },
      },
    });
    const geoByEmail = await fetchEmailGeosByIds(rows.map((r) => r.email_id));
    return rows.map((r) => attachEmailGeo(r, geoByEmail));
  },

  async getById(id: number) {
    const row = await prisma.ai_email_proposals.findUnique({
      where: { id },
      include: {
        emails: {
          select: {
            id: true,
            subject: true,
            date_received: true,
            screenshot_url: true,
            from_email: true,
            from_name: true,
            body_text: true,
            related_casino_id: true,
            to_email: true,
          },
        },
        email_topics: { select: { id: true, name: true } },
        casinos: { select: { id: true, name: true } },
      },
    });
    if (!row) return null;
    const geoByEmail = await fetchEmailGeosByIds([row.email_id]);
    return attachEmailGeo(row, geoByEmail);
  },

  async markViewed(id: number) {
    const row = await prisma.ai_email_proposals.findUnique({ where: { id } });
    if (!row) throw new AppError(404, 'Предложение не найдено');
    return prisma.ai_email_proposals.update({
      where: { id },
      data: { viewed_at: row.viewed_at ?? new Date() },
    });
  },

  async reject(id: number, userId: number | null) {
    const row = await prisma.ai_email_proposals.findUnique({ where: { id } });
    if (!row) throw new AppError(404, 'Предложение не найдено');
    if (row.status !== 'pending') throw new AppError(400, 'Уже обработано');
    return prisma.ai_email_proposals.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewed_by: userId ?? undefined,
        reviewed_at: new Date(),
        viewed_at: row.viewed_at ?? new Date(),
      },
    });
  },

  async approveBonus(
    id: number,
    casinoId: number,
    overrides: Record<string, unknown>,
    userId: number | null,
  ) {
    const row = await prisma.ai_email_proposals.findUnique({
      where: { id },
      include: { emails: { select: { screenshot_url: true } } },
    });
    if (!row) throw new AppError(404, 'Предложение не найдено');
    if (row.proposal_type !== 'bonus') throw new AppError(400, 'Это не предложение бонуса');
    if (row.status !== 'pending') throw new AppError(400, 'Уже обработано');

    const base = { ...(row.payload_json as Record<string, unknown>), ...overrides };
    delete base.casino_name;
    delete base.casino;

    const geo = String(overrides.geo ?? base.geo ?? 'ALL').slice(0, 10);
    const name = String(overrides.name ?? base.name ?? 'Бонус из письма').slice(0, 255);
    const body = { ...base, geo, name };

    const bonus = await casinoBonusService.create(casinoId, body, userId, { createdFromEmail: true });

    const rel = copyEmailScreenshotToSubdir(row.emails?.screenshot_url ?? null, id, 'bonuses');
    if (rel) {
      await casinoBonusService.addBonusImage(casinoId, bonus.id, rel, 'email-screenshot.png');
    }

    await prisma.ai_email_proposals.update({
      where: { id },
      data: {
        status: 'approved',
        resolved_bonus_id: bonus.id,
        reviewed_by: userId ?? undefined,
        reviewed_at: new Date(),
        viewed_at: row.viewed_at ?? new Date(),
      },
    });

    return { bonus };
  },

  async approvePromo(
    id: number,
    casinoId: number,
    overrides: Record<string, unknown>,
    userId: number | null,
  ) {
    const row = await prisma.ai_email_proposals.findUnique({
      where: { id },
      include: { emails: { select: { screenshot_url: true } } },
    });
    if (!row) throw new AppError(404, 'Предложение не найдено');
    if (row.proposal_type !== 'promo') throw new AppError(400, 'Это не предложение промо');
    if (row.status !== 'pending') throw new AppError(400, 'Уже обработано');

    const base = { ...(row.payload_json as Record<string, unknown>), ...overrides };
    delete base.casino_name;
    delete base.casino;

    const geo = String(overrides.geo ?? base.geo ?? 'ALL').slice(0, 10);
    const name = String(overrides.name ?? base.name ?? 'Промо из письма').slice(0, 255);
    const body = { ...base, geo, name };

    const promo = await casinoPromoService.create(casinoId, body, userId, { createdFromEmail: true });

    const rel = copyEmailScreenshotToSubdir(row.emails?.screenshot_url ?? null, id, 'promos');
    if (rel) {
      await casinoPromoService.addImage(casinoId, promo.id, rel, 'email-screenshot.png');
    }

    await prisma.ai_email_proposals.update({
      where: { id },
      data: {
        status: 'approved',
        resolved_promo_id: promo.id,
        reviewed_by: userId ?? undefined,
        reviewed_at: new Date(),
        viewed_at: row.viewed_at ?? new Date(),
      },
    });

    return { promo };
  },

  /**
   * Ручной запуск генерации предложения (тест / отладка). Admin only с роутера.
   * @param force удалить существующую запись (email_id + proposal_type) и создать заново
   */
  async devTrigger(emailId: number, proposalType: 'bonus' | 'promo', force: boolean) {
    const email = await prisma.emails.findUnique({ where: { id: emailId } });
    if (!email) throw new AppError(404, 'Письмо не найдено');

    let topicId = email.topic_id;
    if (!topicId) {
      const aiTarget = proposalType === 'bonus' ? 'bonus' : 'promo';
      const topic = await prisma.email_topics.findFirst({
        where: { ai_target: aiTarget },
        orderBy: { id: 'asc' },
      });
      topicId = topic?.id ?? null;
    }
    if (!topicId) {
      throw new AppError(
        400,
        'Не удалось определить тему: назначьте письму тему с действием ИИ или создайте тему с типом bonus/promo',
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new AppError(503, 'OPENAI_API_KEY не задан — генерация ИИ недоступна');
    }

    const existing = await prisma.ai_email_proposals.findUnique({
      where: { email_id_proposal_type: { email_id: emailId, proposal_type: proposalType } },
    });

    if (existing && !force) {
      return {
        ok: true as const,
        skipped: true as const,
        message:
          'Предложение уже существует. Передайте force=1 (query) или force: true в теле для пересоздания.',
        proposal: existing,
      };
    }

    if (existing && force) {
      await prisma.ai_email_proposals.delete({ where: { id: existing.id } });
    }

    await tryCreateEmailAiProposal(emailId, topicId, proposalType);

    const created = await prisma.ai_email_proposals.findUnique({
      where: { email_id_proposal_type: { email_id: emailId, proposal_type: proposalType } },
    });

    return { ok: true as const, skipped: false as const, proposal: created };
  },
};
