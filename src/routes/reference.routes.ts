import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as refController from '../controllers/reference.controller';

const router = Router();

// Bonus names
router.get('/ref/bonus-names', authenticate, refController.getBonusNames);
router.post('/ref/bonus-names', authenticate, refController.createBonusName);

// Payment types
router.get('/ref/payment-types', authenticate, refController.getPaymentTypes);
router.post('/ref/payment-types', authenticate, refController.createPaymentType);

// Payment methods
router.get('/ref/payment-methods', authenticate, refController.getPaymentMethods);
router.post('/ref/payment-methods', authenticate, refController.createPaymentMethod);

// Promo types (tournament type)
router.get('/ref/promo-types', authenticate, refController.getPromoTypes);
router.post('/ref/promo-types', authenticate, refController.createPromoType);

// Providers (game/slot providers)
router.get('/ref/providers', authenticate, refController.getProviders);
router.post('/ref/providers', authenticate, refController.createProvider);

export default router;
