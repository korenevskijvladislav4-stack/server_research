import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import * as casinoProviderController from './casinoProvider.controller';
import {
  addProviderToCasinoValidators,
  previewExtractProvidersValidators,
  applyProviderNamesValidators,
} from '../../validators/casinoProvider.validators';

const router = Router();

router.get(
  '/providers/analytics',
  authenticate,
  asyncHandler(casinoProviderController.getProviderAnalytics),
);
router.get(
  '/providers/analytics/export',
  authenticate,
  asyncHandler(casinoProviderController.exportProviderAnalyticsXlsx),
);

router.get(
  '/casinos/:casinoId/providers',
  authenticate,
  asyncHandler(casinoProviderController.listCasinoProviders),
);

router.post(
  '/casinos/:casinoId/providers',
  authenticate,
  validate(addProviderToCasinoValidators),
  asyncHandler(casinoProviderController.addProviderToCasino),
);

router.delete(
  '/casinos/:casinoId/providers/:providerId',
  authenticate,
  asyncHandler(casinoProviderController.removeProviderFromCasino),
);

router.post(
  '/casinos/:casinoId/providers/extract-ai',
  authenticate,
  asyncHandler(casinoProviderController.extractAndAddProviders),
);

router.post(
  '/casinos/:casinoId/providers/extract-preview',
  authenticate,
  validate(previewExtractProvidersValidators),
  asyncHandler(casinoProviderController.previewExtractProviders),
);

router.post(
  '/casinos/:casinoId/providers/apply-names',
  authenticate,
  validate(applyProviderNamesValidators),
  asyncHandler(casinoProviderController.applyProviderNames),
);

export default router;

