import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { connectDatabase } from './database/connection';
import { errorHandler } from './middleware/errorHandler';
import casinoRoutes from './routes/casino.routes';
import promoRoutes from './routes/promo.routes';
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
import slotSelectorRoutes from './routes/slotSelector.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files for uploaded images
// In development: __dirname = server/src, so ../uploads = server/uploads
// In production: __dirname = server/dist, so ../uploads = server/uploads
const serverRoot = path.resolve(__dirname, '..');
const uploadsPath = path.join(serverRoot, 'uploads');
console.log('Static uploads path:', uploadsPath);
console.log('Server __dirname:', __dirname);
app.use('/api/uploads', express.static(uploadsPath, {
  setHeaders: (res, _filePath) => {
    // Allow CORS for images
    res.set('Access-Control-Allow-Origin', '*');
  }
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/casinos', casinoRoutes);
app.use('/api/promos', promoRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api', casinoProfileRoutes);
app.use('/api', casinoBonusRoutes);
app.use('/api', casinoPaymentRoutes);
app.use('/api', geoRoutes);
app.use('/api', casinoCommentRoutes);
app.use('/api', referenceRoutes);
app.use('/api/profile-fields', profileFieldRoutes);
app.use('/api/profile-contexts', profileContextRoutes);
app.use('/api/profile-settings', profileSettingRoutes);
app.use('/api', casinoAccountRoutes);
app.use('/api', slotSelectorRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

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
    await connectDatabase();
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
