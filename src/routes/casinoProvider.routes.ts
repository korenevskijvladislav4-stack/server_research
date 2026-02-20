import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as casinoProviderController from '../controllers/casinoProvider.controller';

const router = Router();

router.get('/providers/analytics', authenticate, casinoProviderController.getProviderAnalytics);
router.get('/casinos/:casinoId/providers', authenticate, casinoProviderController.listCasinoProviders);
router.post('/casinos/:casinoId/providers', authenticate, casinoProviderController.addProviderToCasino);
router.delete('/casinos/:casinoId/providers/:providerId', authenticate, casinoProviderController.removeProviderFromCasino);
router.post('/casinos/:casinoId/providers/extract-ai', authenticate, casinoProviderController.extractAndAddProviders);

export default router;
