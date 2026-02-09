import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Force Node.js process timezone to UTC so new Date() is always UTC
process.env.TZ = 'UTC';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'research_crm',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+00:00', // UTC — matches process.env.TZ
});

export const connectDatabase = async (): Promise<void> => {
  try {
    const connection = await pool.getConnection();
    console.log('Database connected successfully');
    connection.release();
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
};

export default pool;
