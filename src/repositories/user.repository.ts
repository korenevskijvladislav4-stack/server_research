import { RowDataPacket } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';

export interface UserRow {
  id: number;
  username: string;
  email: string;
  password: string;
  role: string;
  is_active: number | boolean;
}

export async function findUserByEmailOrUsername(
  connection: PoolConnection,
  email: string,
  username: string
): Promise<UserRow | null> {
  const [rows] = await connection.query<RowDataPacket[]>(
    'SELECT id, username, email, password, role, is_active FROM users WHERE email = ? OR username = ? LIMIT 1',
    [email, username]
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ? (row as UserRow) : null;
}

export async function findUserByEmail(
  connection: PoolConnection,
  email: string
): Promise<UserRow | null> {
  const [rows] = await connection.query<RowDataPacket[]>(
    'SELECT id, username, email, password, role, is_active FROM users WHERE LOWER(TRIM(email)) = ? LIMIT 1',
    [email]
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ? (row as UserRow) : null;
}

export async function createUser(
  connection: PoolConnection,
  username: string,
  email: string,
  hashedPassword: string
): Promise<void> {
  await connection.query(
    'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
    [username, email, hashedPassword]
  );
}
