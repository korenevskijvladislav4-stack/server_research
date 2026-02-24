import bcrypt from 'bcryptjs';
import prisma from '../../lib/prisma';
import { users } from '@prisma/client';

export const authService = {
  async findUserByEmail(email: string): Promise<users | null> {
    const normalized = email.trim().toLowerCase();
    return prisma.users.findFirst({
      where: { email: normalized },
    });
  },

  async findUserByEmailOrUsername(email: string, username: string): Promise<users | null> {
    return prisma.users.findFirst({
      where: {
        OR: [{ email: email.trim() }, { username: username.trim() }],
      },
    });
  },

  async createUser(username: string, email: string, password: string): Promise<users> {
    const hashed = await bcrypt.hash(password, 10);
    return prisma.users.create({
      data: {
        username: username.trim(),
        email: email.trim().toLowerCase(),
        password: hashed,
      },
    });
  },

  async validatePassword(plain: string, hashed: string): Promise<boolean> {
    return bcrypt.compare(plain, hashed);
  },
};
