import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { loadConfig, getConfig } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import casinoRoutes from './routes/casino.routes';
import emailRoutes from './routes/email.routes';
import authRoutes from './routes/auth.routes';
import casinoProfileRoutes from './routes/casinoProfile.routes';
import casinoBonusRoutes from './routes/casinoBonus.routes';
import casinoPaymentRoutes from './routes/casinoPayment.routes';
import geoRoutes from './routes/geo.routes';
import casinoCommentRoutes from './routes/casinoComment.routes';
import referenceRoutes from './routes/reference.routes';
import profileFieldRoutes from './routes/profileField.routes';
import profileContextRoutes from './routes/profileContext.routes';
import profileSettingRoutes from './routes/profileSetting.routes';
import casinoAccountRoutes from './routes/casinoAccount.routes';
import selectorsRoutes from './routes/selectors.routes';
import imapAccountRoutes from './routes/imapAccount.routes';
import tagRoutes from './routes/tag.routes';
import casinoPromoRoutes from './routes/casinoPromo.routes';
import casinoProviderRoutes from './routes/casinoProvider.routes';
import chatRoutes from './routes/chat.routes';
import aiEmailProposalRoutes from './routes/aiEmailProposal.routes';
import { startEmailSyncScheduler } from './services/email-sync-scheduler.service';
import { healthCheck } from './controllers/health.controller';
import { asyncHandler } from './middleware/asyncHandler';
import swaggerUi from 'swagger-ui-express';
import { getSwaggerSpec } from './config/swagger';
import prisma from './lib/prisma';

dotenv.config();
loadConfig();

const app = express();

// CORS configuration - разрешаем запросы с клиентского домена
// Должно быть ДО helmet, чтобы CORS заголовки не блокировались
function getAllowedOrigins(): string[] {
  const config = getConfig();
  const raw =
    config.nodeEnv === 'production' && config.cors.originProd
      ? config.cors.originProd
      : config.cors.origin;
  return raw ? raw.split(',').map((o) => o.trim()) : ['http://localhost:3000'];
}
const allowedOrigins = getAllowedOrigins();

logger.info({ origins: allowedOrigins }, 'Allowed CORS origins');

// Функция для нормализации origin (убирает путь, оставляет только протокол + домен)
const normalizeOrigin = (origin: string): string => {
  try {
    const url = new URL(origin);
    return `${url.protocol}//${url.host}`;
  } catch {
    return origin;
  }
};

app.use(cors({
  origin: (origin, callback) => {
    // Разрешаем запросы без origin (например, Postman, мобильные приложения)
    if (!origin) {
      return callback(null, true);
    }
    
    // Нормализуем origin (убираем путь, оставляем только домен)
    const normalizedOrigin = normalizeOrigin(origin);
    
    // Проверяем, есть ли origin в списке разрешенных (сравниваем и оригинальный, и нормализованный)
    const isAllowed = allowedOrigins.some(allowed => {
      const normalizedAllowed = normalizeOrigin(allowed);
      return origin === allowed || normalizedOrigin === normalizedAllowed;
    });
    
    if (isAllowed) {
      // Возвращаем нормализованный origin в заголовке (без пути)
      callback(null, normalizedOrigin);
    } else {
      // Логируем для отладки
      logger.warn({ origin, normalizedOrigin, allowedOrigins }, 'CORS blocked origin');
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
}));

// Настройка Helmet с учетом CORS
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  // Отключаем некоторые политики, которые могут конфликтовать с CORS
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(morgan('dev'));
// Выгрузка провайдеров (HTML/JSON страницы) легко превышает дефолт 100kb body-parser
const jsonBodyLimit = process.env.JSON_BODY_LIMIT || '10mb';
app.use(express.json({ limit: jsonBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: jsonBodyLimit }));

// Static files for uploaded images
// In development: __dirname = server/src, so ../uploads = server/uploads
// In production: __dirname = server/dist, so ../uploads = server/uploads
const serverRoot = path.resolve(__dirname, '..');
const uploadsPath = path.join(serverRoot, 'uploads');
logger.info({ uploadsPath }, 'Static uploads path');
app.use('/api/uploads', express.static(uploadsPath, {
  setHeaders: (res, _filePath) => {
    // Allow CORS for images
    res.set('Access-Control-Allow-Origin', '*');
  }
}));

// Routes — all API endpoints under /api/v1
const V1 = '/api/v1';

app.use(`${V1}/auth`, authRoutes);
app.use(`${V1}/casinos`, casinoRoutes);
app.use(`${V1}/emails`, emailRoutes);
app.use(V1, casinoProfileRoutes);
app.use(V1, casinoBonusRoutes);
app.use(V1, casinoPaymentRoutes);
app.use(V1, geoRoutes);
app.use(V1, casinoCommentRoutes);
app.use(V1, referenceRoutes);
app.use(`${V1}/profile-fields`, profileFieldRoutes);
app.use(`${V1}/profile-contexts`, profileContextRoutes);
app.use(`${V1}/profile-settings`, profileSettingRoutes);
app.use(V1, casinoAccountRoutes);
app.use(V1, selectorsRoutes);
app.use(`${V1}/imap-accounts`, imapAccountRoutes);
app.use(V1, tagRoutes);
app.use(V1, casinoPromoRoutes);
app.use(V1, casinoProviderRoutes);
app.use(V1, chatRoutes);
app.use(V1, aiEmailProposalRoutes);

app.get(`${V1}/health`, asyncHandler(healthCheck));

// OpenAPI docs (optional: restrict to dev with getConfig().nodeEnv === 'development')
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(getSwaggerSpec(), { customSiteTitle: 'Research CRM API' }));
app.get('/api-docs.json', (_req, res) => res.json(getSwaggerSpec()));

// Serve React app in production (after all API routes)
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientBuildPath));
  
  // Catch all handler: send back React's index.html file for SPA routing
  // This must be after all API routes but before error handler
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Error handling (must be last)
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
    const config = getConfig();
    app.listen(config.port, () => {
      logger.info({ port: config.port }, 'Server is running');
      startEmailSyncScheduler();
    });
  } catch (error) {
    logger.fatal(error, 'Failed to start server');
    process.exit(1);
  }
};

startServer();
