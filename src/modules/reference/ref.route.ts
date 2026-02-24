import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import * as refController from './ref.controller';

const router = Router();

router.get('/ref/bonus-names', authenticate, asyncHandler(refController.getBonusNames));
router.post('/ref/bonus-names', authenticate, asyncHandler(refController.createBonusName));
router.get('/ref/payment-types', authenticate, asyncHandler(refController.getPaymentTypes));
router.post('/ref/payment-types', authenticate, asyncHandler(refController.createPaymentType));
router.get('/ref/payment-methods', authenticate, asyncHandler(refController.getPaymentMethods));
router.post('/ref/payment-methods', authenticate, asyncHandler(refController.createPaymentMethod));
router.get('/ref/promo-types', authenticate, asyncHandler(refController.getPromoTypes));
router.post('/ref/promo-types', authenticate, asyncHandler(refController.createPromoType));
router.get('/ref/providers', authenticate, asyncHandler(refController.getProviders));
router.post('/ref/providers', authenticate, asyncHandler(refController.createProvider));

export default router;
