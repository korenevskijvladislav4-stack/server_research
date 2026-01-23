import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import pool from './connection';

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

  const conn = await pool.getConnection();
  try {
    // if exists by email -> update; else insert
    const [existing] = await conn.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);

    if (Array.isArray(existing) && existing.length > 0) {
      const id = (existing[0] as any).id;
      await conn.query(
        'UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?',
        [username, passwordHash, role, id]
      );
      // eslint-disable-next-line no-console
      console.log(`✅ Superuser updated: id=${id}, email=${email}`);
      return;
    }

    const [result] = await conn.query(
      'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
      [username, email, passwordHash, role]
    );
    const insertId = (result as any).insertId;
    // eslint-disable-next-line no-console
    console.log(`✅ Superuser created: id=${insertId}, email=${email}`);
  } finally {
    conn.release();
  }
}

seedSuperuser()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('❌ seed-superuser failed:', err);
    process.exit(1);
  });

