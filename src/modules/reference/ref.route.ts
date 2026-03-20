import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { idParamValidators } from '../../validators/idParam.validators';
import * as refController from './ref.controller';

const router = Router();

router.get('/ref/bonus-names', authenticate, asyncHandler(refController.getBonusNames));
router.post('/ref/bonus-names', authenticate, asyncHandler(refController.createBonusName));
router.delete(
  '/ref/bonus-names/:id',
  authenticate,
  validate(idParamValidators),
  asyncHandler(refController.deleteBonusName),
);
router.get('/ref/payment-types', authenticate, asyncHandler(refController.getPaymentTypes));
router.post('/ref/payment-types', authenticate, asyncHandler(refController.createPaymentType));
router.delete(
  '/ref/payment-types/:id',
  authenticate,
  validate(idParamValidators),
  asyncHandler(refController.deletePaymentType),
);
router.get('/ref/payment-methods', authenticate, asyncHandler(refController.getPaymentMethods));
router.post('/ref/payment-methods', authenticate, asyncHandler(refController.createPaymentMethod));
router.delete(
  '/ref/payment-methods/:id',
  authenticate,
  validate(idParamValidators),
  asyncHandler(refController.deletePaymentMethod),
);
router.get('/ref/promo-types', authenticate, asyncHandler(refController.getPromoTypes));
router.post('/ref/promo-types', authenticate, asyncHandler(refController.createPromoType));
router.delete(
  '/ref/promo-types/:id',
  authenticate,
  validate(idParamValidators),
  asyncHandler(refController.deletePromoType),
);
router.get('/ref/providers', authenticate, asyncHandler(refController.getProviders));
router.post('/ref/providers', authenticate, asyncHandler(refController.createProvider));
router.delete(
  '/ref/providers/:id',
  authenticate,
  validate(idParamValidators),
  asyncHandler(refController.deleteProvider),
);

export default router;
