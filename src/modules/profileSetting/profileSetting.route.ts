import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import * as ctrl from './profileSetting.controller';

const router = Router();
router.get('/aggregated', authenticate, asyncHandler(ctrl.getAggregatedProfileSettings));
router.get('/casino/:casinoId', authenticate, asyncHandler(ctrl.getCasinoProfileSettings));
router.post('/casino/:casinoId', authenticate, asyncHandler(ctrl.updateProfileSetting));
router.post('/casino/:casinoId/batch', authenticate, asyncHandler(ctrl.batchUpdateProfileSettings));
export default router;
