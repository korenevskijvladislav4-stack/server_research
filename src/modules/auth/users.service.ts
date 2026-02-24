import bcrypt from 'bcryptjs';
import prisma from '../../lib/prisma';
import { users, users_role } from '@prisma/client';
import { calculateTotalPages } from '../../common/utils/query.utils';

const ALLOWED_SORT_FIELDS = ['id', 'username', 'email', 'role', 'is_active', 'created_at', 'updated_at'] as const;
const DEFAULT_SORT = 'username';

export interface UsersListParams {
  page?: number;
  pageSize?: number;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  role?: string;
  is_active?: unknown;
}

export interface PaginatedUsers {
  data: Pick<users, 'id' | 'username' | 'email' | 'role' | 'is_active' | 'created_at' | 'updated_at'>[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export const usersService = {
  async findAll(params: UsersListParams): Promise<PaginatedUsers> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const sortField = params.sortField && ALLOWED_SORT_FIELDS.includes(params.sortField as any) ? params.sortField : DEFAULT_SORT;
    const sortOrder = params.sortOrder === 'desc' ? 'desc' : 'asc';

    const where: Record<string, unknown> = {};
    if (params.role) where.role = params.role as users_role;
    if (params.is_active !== undefined && params.is_active !== '') {
      where.is_active = params.is_active === true || params.is_active === 'true' || params.is_active === 1;
    }
    if (params.search && params.search.trim()) {
      where.OR = [
        { username: { contains: params.search.trim() } },
        { email: { contains: params.search.trim() } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.users.count({ where }),
      prisma.users.findMany({
        where,
        select: { id: true, username: true, email: true, role: true, is_active: true, created_at: true, updated_at: true },
        orderBy: { [sortField]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data: rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: calculateTotalPages(total, pageSize),
      },
    };
  },

  async create(data: { username: string; email: string; password: string; role?: string; is_active?: boolean }): Promise<users> {
    const existing = await prisma.users.findFirst({
      where: { OR: [{ email: data.email.trim() }, { username: data.username.trim() }] },
    });
    if (existing) throw new Error('USER_EXISTS');

    const hashed = await bcrypt.hash(data.password, 10);
    return prisma.users.create({
      data: {
        username: data.username.trim(),
        email: data.email.trim().toLowerCase(),
        password: hashed,
        role: (data.role === 'admin' ? 'admin' : 'user') as users_role,
        is_active: data.is_active !== false,
      },
    });
  },

  async update(
    id: number,
    data: { username?: string; email?: string; password?: string; role?: string; is_active?: boolean }
  ): Promise<users | null> {
    const user = await prisma.users.findUnique({ where: { id } });
    if (!user) return null;

    if (data.email !== undefined || data.username !== undefined) {
      const or: { email?: string; username?: string }[] = [];
      if (data.email !== undefined) or.push({ email: data.email.trim().toLowerCase() });
      if (data.username !== undefined) or.push({ username: data.username.trim() });
      const duplicate = await prisma.users.findFirst({
        where: { OR: or, NOT: { id } },
      });
      if (duplicate) throw new Error('EMAIL_OR_USERNAME_TAKEN');
    }

    const updateData: Record<string, unknown> = {};
    if (data.username !== undefined) updateData.username = data.username.trim();
    if (data.email !== undefined) updateData.email = data.email.trim().toLowerCase();
    if (data.role !== undefined) updateData.role = data.role === 'admin' ? 'admin' : 'user';
    if (data.is_active !== undefined) updateData.is_active = data.is_active;
    if (data.password !== undefined) updateData.password = await bcrypt.hash(data.password, 10);

    return prisma.users.update({
      where: { id },
      data: updateData as any,
    });
  },

  async deactivate(id: number): Promise<boolean> {
    const r = await prisma.users.updateMany({
      where: { id },
      data: { is_active: false },
    });
    return r.count > 0;
  },
};
