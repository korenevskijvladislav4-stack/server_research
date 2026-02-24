import prisma from '../../lib/prisma';
import { encryptPassword } from '../../common/utils/crypto.utils';
import { ConnectionType } from '../../models/ImapAccount';

const safeSelect = {
  id: true,
  name: true,
  connection_type: true,
  host: true,
  port: true,
  user: true,
  tls: true,
  is_active: true,
  created_at: true,
  updated_at: true,
} as const;

export const imapAccountService = {
  async list() {
    return prisma.imap_accounts.findMany({
      select: safeSelect,
      orderBy: { name: 'asc' },
    });
  },

  async getById(id: number) {
    return prisma.imap_accounts.findUnique({
      where: { id },
      select: safeSelect,
    });
  },

  async getFullById(id: number) {
    return prisma.imap_accounts.findUnique({
      where: { id },
    });
  },

  async createImapAccount(data: {
    name: string;
    host: string;
    port?: number;
    user: string;
    password: string;
    tls?: boolean;
    is_active?: boolean;
  }) {
    const row = await prisma.imap_accounts.create({
      data: {
        name: data.name,
        connection_type: 'imap' as ConnectionType,
        host: data.host,
        port: data.port ?? 993,
        user: data.user,
        password_encrypted: encryptPassword(data.password),
        tls: data.tls ?? true,
        is_active: data.is_active ?? true,
      },
      select: safeSelect,
    });
    return row;
  },

  async updateImapAccount(
    id: number,
    data: {
      name?: string;
      host?: string;
      port?: number;
      user?: string;
      password?: string;
      tls?: boolean;
      is_active?: boolean;
    },
  ) {
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.host !== undefined) updateData.host = data.host;
    if (data.port !== undefined) updateData.port = data.port;
    if (data.user !== undefined) updateData.user = data.user;
    if (data.password !== undefined) {
      updateData.password_encrypted = encryptPassword(data.password);
    }
    if (data.tls !== undefined) updateData.tls = !!data.tls;
    if (data.is_active !== undefined) updateData.is_active = !!data.is_active;

    if (Object.keys(updateData).length === 0) {
      return this.getById(id);
    }

    const row = await prisma.imap_accounts.update({
      where: { id },
      data: updateData,
      select: safeSelect,
    });
    return row;
  },

  async deleteImapAccount(id: number) {
    try {
      await prisma.imap_accounts.delete({
        where: { id },
      });
      return true;
    } catch {
      return false;
    }
  },

  async createGmailOAuthAccount(data: { displayName: string; email: string; refreshToken: string }) {
    const row = await prisma.imap_accounts.create({
      data: {
        name: data.displayName,
        connection_type: 'gmail_oauth' as ConnectionType,
        host: 'imap.gmail.com',
        port: 993,
        user: data.email,
        password_encrypted: '',
        oauth_refresh_token_encrypted: encryptPassword(data.refreshToken),
        tls: true,
        is_active: true,
      },
      select: safeSelect,
    });
    return row;
  },
};

