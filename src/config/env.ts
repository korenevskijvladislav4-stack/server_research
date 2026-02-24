import dotenv from 'dotenv';

dotenv.config();

const optional = {
  NODE_ENV: 'development',
  PORT: '5000',
  DB_HOST: 'localhost',
  DB_PORT: '3306',
  DB_USER: 'root',
  DB_PASSWORD: '',
  DB_NAME: 'research_crm',
  JWT_EXPIRES_IN: '30d',
  CORS_ORIGIN: '',
  CORS_ORIGIN_PROD: '',
} as const;

function validateEnv(): void {
  const secret = process.env.JWT_SECRET;
  if (secret === undefined || secret === '' || secret === 'your-secret-key') {
    throw new Error(
      'JWT_SECRET is required and must not be empty or "your-secret-key". Set it in .env.'
    );
  }
}

export function loadConfig(): Config {
  validateEnv();
  return {
    nodeEnv: process.env.NODE_ENV ?? optional.NODE_ENV,
    port: parseInt(process.env.PORT ?? optional.PORT, 10),
    jwt: {
      secret: process.env.JWT_SECRET!,
      expiresIn: process.env.JWT_EXPIRES_IN ?? optional.JWT_EXPIRES_IN,
    },
    db: {
      host: process.env.DB_HOST ?? optional.DB_HOST,
      port: parseInt(process.env.DB_PORT ?? optional.DB_PORT, 10),
      user: process.env.DB_USER ?? optional.DB_USER,
      password: process.env.DB_PASSWORD ?? optional.DB_PASSWORD,
      database: process.env.DB_NAME ?? optional.DB_NAME,
    },
    cors: {
      origin: process.env.CORS_ORIGIN ?? optional.CORS_ORIGIN,
      originProd: process.env.CORS_ORIGIN_PROD ?? optional.CORS_ORIGIN_PROD,
    },
  };
}

export interface Config {
  nodeEnv: string;
  port: number;
  jwt: {
    secret: string;
    expiresIn: string;
  };
  db: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  cors: {
    origin: string;
    originProd: string;
  };
}

let cached: Config | null = null;

export function getConfig(): Config {
  if (!cached) {
    cached = loadConfig();
  }
  return cached;
}
