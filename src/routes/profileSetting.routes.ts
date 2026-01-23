import { Router } from 'express';
import {
  getCasinoProfileSettings,
  updateProfileSetting,
  batchUpdateProfileSettings,
  getAggregatedProfileSettings,
} from '../controllers/profileSetting.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Aggregated settings (for analytics page) - must be before :casinoId routes
router.get('/aggregated', authenticate, getAggregatedProfileSettings);

router.get('/casino/:casinoId', authenticate, getCasinoProfileSettings);
router.post('/casino/:casinoId', authenticate, updateProfileSetting);
router.post('/casino/:casinoId/batch', authenticate, batchUpdateProfileSettings);

export default router;
