import { PoolConnection } from 'mysql2/promise';
import pool from './connection';

export async function withConnection<T>(
  fn: (connection: PoolConnection) => Promise<T>
): Promise<T> {
  const connection = await pool.getConnection();
  try {
    return await fn(connection);
  } finally {
    connection.release();
  }
}
