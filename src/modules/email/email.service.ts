import prisma from '../../lib/prisma';
import { Email } from '../../models/Email';

const EMAIL_BASE_SELECT = `
  e.*, ca.geo AS geo, c.name AS casino_name, et.name AS topic_name
`;

const EMAIL_BASE_FROM = `
  FROM emails e
  LEFT JOIN casinos c ON c.id = e.related_casino_id
  LEFT JOIN casino_accounts ca ON ca.email = e.to_email AND ca.casino_id = e.related_casino_id
  LEFT JOIN email_topics et ON et.id = e.topic_id
`;

const normalizeName = (value?: string | null): string => {
  if (!value) return '';
  let s = value.normalize('NFKD');
  s = s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
  s = s.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase().trim();
  return s;
};

const extractDomainName = (email?: string | null): string => {
  if (!email) return '';
  const match = email.match(/@([^.]+)/);
  return match?.[1] ? normalizeName(match[1]) : '';
};

export const emailMatchesCasino = (email: Email, casinoNorm: string): boolean => {
  if (!casinoNorm || casinoNorm.length === 0) return false;

  const fromNameNorm = normalizeName(email.from_name);
  const fromEmailNorm = normalizeName(email.from_email);
  const domainName = extractDomainName(email.from_email);

  if (
    fromNameNorm === casinoNorm ||
    fromEmailNorm === casinoNorm ||
    domainName === casinoNorm
  )
    return true;

  if (fromNameNorm.length >= 4 && casinoNorm.length >= 4) {
    if (casinoNorm.includes(fromNameNorm) || fromNameNorm.includes(casinoNorm)) return true;
  }

  if (domainName.length >= 4 && casinoNorm.length >= 4) {
    if (casinoNorm.includes(domainName) || domainName.includes(casinoNorm)) return true;
  }

  return false;
};

export const emailService = {
  async getEmailRecipients() {
    const rows = await prisma.$queryRawUnsafe<
      { email: string; geo: string }[]
    >(
      `SELECT DISTINCT ca.email, ca.geo
       FROM casino_accounts ca
       WHERE ca.email IS NOT NULL AND TRIM(ca.email) != ''
       ORDER BY ca.email`,
    );

    return rows.map((r) => ({ email: r.email, geo: r.geo }));
  },

  async getEmailAnalytics(params: {
    date_from?: string;
    date_to?: string;
    to_email?: string;
    geo?: string;
    topic_id?: number;
  }) {
    const { date_from, date_to, to_email, geo, topic_id } = params;

    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 29);

    const from = date_from ?? defaultFrom.toISOString().slice(0, 10);
    const to = date_to ?? now.toISOString().slice(0, 10);

    let whereExtra = '';
    let joinExtra = '';
    const queryParams: any[] = [from, to];

    if (to_email) {
      whereExtra += ' AND e.to_email = ?';
      queryParams.push(to_email);
    }

    if (geo) {
      joinExtra =
        ' LEFT JOIN casino_accounts ca ON ca.email = e.to_email AND ca.casino_id = e.related_casino_id';
      whereExtra += ' AND ca.geo = ?';
      queryParams.push(geo);
    }
    if (topic_id) {
      whereExtra += ' AND e.topic_id = ?';
      queryParams.push(topic_id);
    }

    const rows = await prisma.$queryRawUnsafe<
      { casino_id: number; casino_name: string | null; dt: string; cnt: number }[]
    >(
      `SELECT
         e.related_casino_id AS casino_id,
         c.name              AS casino_name,
         DATE_FORMAT(e.date_received, '%Y-%m-%d') AS dt,
         CAST(COUNT(*) AS UNSIGNED) AS cnt
       FROM emails e
       LEFT JOIN casinos c ON c.id = e.related_casino_id
       ${joinExtra}
       WHERE e.related_casino_id IS NOT NULL
         AND e.date_received IS NOT NULL
         AND DATE(e.date_received) >= ?
         AND DATE(e.date_received) <= ?
         ${whereExtra}
       GROUP BY e.related_casino_id, c.name, DATE_FORMAT(e.date_received, '%Y-%m-%d')
       ORDER BY c.name, dt`,
      ...queryParams,
    );

    const data = rows.map((r) => ({
      casino_id: r.casino_id,
      casino_name: r.casino_name || '',
      dt: String(r.dt),
      cnt: Number(r.cnt),
    }));

    return { data, date_from: from, date_to: to };
  },

  async getAllEmailsStandard(params: {
    limit: number;
    offset: number;
    is_read?: string;
    to_email?: string;
    date_from?: string;
    date_to?: string;
    geo?: string;
    topic_id?: number;
  }) {
    const { limit, offset, is_read, to_email, date_from, date_to, geo, topic_id } = params;

    let whereClause = 'WHERE 1=1';
    const queryParams: any[] = [];
    const countParams: any[] = [];

    if (is_read !== undefined) {
      const val = is_read === 'true';
      whereClause += ' AND e.is_read = ?';
      queryParams.push(val);
      countParams.push(val);
    }
    if (to_email) {
      whereClause += ' AND e.to_email = ?';
      queryParams.push(to_email);
      countParams.push(to_email);
    }
    if (date_from) {
      whereClause += ' AND DATE(e.date_received) >= ?';
      queryParams.push(date_from);
      countParams.push(date_from);
    }
    if (date_to) {
      whereClause += ' AND DATE(e.date_received) <= ?';
      queryParams.push(date_to);
      countParams.push(date_to);
    }
    if (geo) {
      whereClause += ' AND ca.geo = ?';
      queryParams.push(geo);
      countParams.push(geo);
    }
    if (topic_id) {
      whereClause += ' AND e.topic_id = ?';
      queryParams.push(topic_id);
      countParams.push(topic_id);
    }

    const countRows = await prisma.$queryRawUnsafe<{ total: number }[]>(
      `SELECT COUNT(*) as total ${EMAIL_BASE_FROM} ${whereClause}`,
      ...countParams,
    );
    const total = countRows[0]?.total ?? 0;

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT ${EMAIL_BASE_SELECT} ${EMAIL_BASE_FROM} ${whereClause} ORDER BY e.date_received DESC LIMIT ? OFFSET ?`,
      ...queryParams,
      limit,
      offset,
    );

    return { data: rows, total, limit, offset };
  },

  async getAllEmailsByCasinoNameMatch(params: {
    casinoId: number;
    limit: number;
    offset: number;
    is_read?: string;
    to_email?: string;
    date_from?: string;
    date_to?: string;
    geo?: string;
  }) {
    const { casinoId, limit, offset, is_read, to_email, date_from, date_to, geo } = params;

    const casinoRow = await prisma.casinos.findUnique({
      where: { id: casinoId },
      select: { name: true },
    });
    if (!casinoRow) {
      return { notFound: true as const };
    }
    const casinoNorm = normalizeName(casinoRow.name);

    const emailRows = await prisma.$queryRawUnsafe<
      (Email & { geo?: string; casino_name?: string })[]
    >(
      `SELECT e.*, ca.geo AS geo, c.name AS casino_name
       FROM emails e
       LEFT JOIN casinos c ON c.id = e.related_casino_id
       LEFT JOIN casino_accounts ca ON ca.email = e.to_email AND ca.casino_id = ?
       ORDER BY e.date_received DESC LIMIT 10000`,
      casinoId,
    );

    let matched = emailRows.filter((e) => emailMatchesCasino(e, casinoNorm));

    if (is_read !== undefined) {
      const val = is_read === 'true';
      matched = matched.filter((e) => e.is_read === val);
    }
    if (to_email) {
      matched = matched.filter((e) => e.to_email === to_email);
    }
    if (geo) {
      matched = matched.filter((e) => e.geo === geo);
    }
    if (date_from) {
      matched = matched.filter((e) => {
        if (!e.date_received) return false;
        const d = new Date(e.date_received).toISOString().slice(0, 10);
        return d >= date_from;
      });
    }
    if (date_to) {
      matched = matched.filter((e) => {
        if (!e.date_received) return false;
        const d = new Date(e.date_received).toISOString().slice(0, 10);
        return d <= date_to;
      });
    }

    return {
      notFound: false as const,
      data: matched.slice(offset, offset + limit),
      total: matched.length,
      limit,
      offset,
    };
  },

  async getEmailsByCasinoNameMatchSimple(params: {
    casinoId: number;
    limit: number;
    offset: number;
    to_email?: string;
  }) {
    const { casinoId, limit, offset, to_email } = params;

    const casinoRow = await prisma.casinos.findUnique({
      where: { id: casinoId },
      select: { name: true },
    });
    if (!casinoRow) {
      return { notFound: true as const };
    }
    const casinoNorm = normalizeName(casinoRow.name);

    const emailRows = await prisma.$queryRawUnsafe<
      (Email & { geo?: string; casino_name?: string })[]
    >(
      `SELECT ${EMAIL_BASE_SELECT} ${EMAIL_BASE_FROM} ORDER BY e.date_received DESC LIMIT 10000`,
    );

    let matched = emailRows.filter((e) => emailMatchesCasino(e, casinoNorm));
    if (to_email) {
      matched = matched.filter((e) => e.to_email === to_email);
    }

    return {
      notFound: false as const,
      data: matched.slice(offset, offset + limit),
      total: matched.length,
      limit,
      offset,
    };
  },

  async getEmailById(id: number | string) {
    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT ${EMAIL_BASE_SELECT} ${EMAIL_BASE_FROM} WHERE e.id = ?`,
      numId,
    );
    return rows[0] ?? null;
  },

  async markEmailAsRead(id: number | string) {
    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    await prisma.emails.update({
      where: { id: numId },
      data: { is_read: true },
    });
    return this.getEmailById(numId);
  },

  async linkEmailToCasino(id: number | string, casinoId: number) {
    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    await prisma.emails.update({
      where: { id: numId },
      data: { related_casino_id: casinoId },
    });
    return this.getEmailById(numId);
  },

  async clearSummaryAndTopic(id: number) {
    await prisma.emails.update({
      where: { id },
      data: { ai_summary: null, topic_id: null },
    });
  },

  async clearScreenshot(id: number) {
    await prisma.emails.update({
      where: { id },
      data: { screenshot_url: null },
    });
  },

  async exportEmails(params: {
    related_casino_id?: string;
    to_email?: string;
    geo?: string;
    date_from?: string;
    date_to?: string;
    is_read?: string;
    topic_id?: number;
  }) {
    const { related_casino_id, to_email, geo, date_from, date_to, is_read, topic_id } = params;

    let whereClause = 'WHERE 1=1';
    const queryParams: any[] = [];

    if (related_casino_id) {
      whereClause += ' AND e.related_casino_id = ?';
      queryParams.push(related_casino_id);
    }
    if (to_email) {
      whereClause += ' AND e.to_email = ?';
      queryParams.push(to_email);
    }
    if (date_from) {
      whereClause += ' AND DATE(e.date_received) >= ?';
      queryParams.push(date_from);
    }
    if (date_to) {
      whereClause += ' AND DATE(e.date_received) <= ?';
      queryParams.push(date_to);
    }
    if (is_read !== undefined) {
      whereClause += ' AND e.is_read = ?';
      queryParams.push(is_read === 'true');
    }
    if (geo) {
      whereClause += ' AND ca.geo = ?';
      queryParams.push(geo);
    }
    if (topic_id) {
      whereClause += ' AND e.topic_id = ?';
      queryParams.push(topic_id);
    }

    const rows = await prisma.$queryRawUnsafe<
      {
        id: number;
        from_email: string | null;
        from_name: string | null;
        to_email: string | null;
        subject: string | null;
        date_received: Date | null;
        ai_summary: string | null;
        screenshot_url: string | null;
        related_casino_id: number | null;
        casino_name: string | null;
        geo: string | null;
        topic_name: string | null;
      }[]
    >(
      `SELECT
         e.id,
         e.from_email,
         e.from_name,
         e.to_email,
         e.subject,
         e.date_received,
         e.ai_summary,
         e.screenshot_url,
         e.related_casino_id,
         c.name AS casino_name,
         ca.geo AS geo,
         et.name AS topic_name
       ${EMAIL_BASE_FROM}
       ${whereClause}
       ORDER BY e.date_received DESC
       LIMIT 10000`,
      ...queryParams,
    );

    return rows;
  },

  async autoLinkEmailsToCasinos(resetAll: boolean): Promise<{ linked: number }> {
    if (resetAll) {
      await prisma.emails.updateMany({
        data: { related_casino_id: null },
      });
    }

    const casinosRaw = await prisma.casinos.findMany({
      select: { id: true, name: true },
    });
    const casinos = casinosRaw
      .map((c) => ({ id: c.id, norm: normalizeName(c.name) }))
      .filter((c) => c.norm.length > 0);

    if (casinos.length === 0) return { linked: 0 };

    const emailsRaw = await prisma.emails.findMany({
      where: { related_casino_id: null },
      select: { id: true, from_name: true, from_email: true },
    });

    if (!emailsRaw.length) return { linked: 0 };

    let linked = 0;

    for (const email of emailsRaw as unknown as Email[]) {
      for (const casino of casinos) {
        if (emailMatchesCasino(email, casino.norm)) {
          await prisma.emails.update({
            where: { id: (email as any).id },
            data: { related_casino_id: casino.id },
          });
          linked++;
          break;
        }
      }
    }

    if (linked > 0) {
      console.log(`Auto-linked ${linked} emails to casinos`);
    }

    return { linked };
  },
};

