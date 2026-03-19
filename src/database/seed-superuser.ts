import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';

dotenv.config();

function requiredEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Missing env var: ${name}`);
  }
  return val;
}

async function seedSuperuser(): Promise<void> {
  const username = process.env.SUPERUSER_USERNAME ?? 'admin';
  const email = requiredEnv('SUPERUSER_EMAIL');
  const password = requiredEnv('SUPERUSER_PASSWORD');
  const role = 'admin';

  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await prisma.users.findFirst({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    await prisma.users.update({
      where: { id: existing.id },
      data: { username, password: passwordHash, role },
    });
    console.log(`✅ Superuser updated: id=${existing.id}, email=${email}`);
  } else {
    const created = await prisma.users.create({
      data: { username, email, password: passwordHash, role },
    });
    console.log(`✅ Superuser created: id=${created.id}, email=${email}`);
  }
}

seedSuperuser()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ seed-superuser failed:', err);
    process.exit(1);
  });
