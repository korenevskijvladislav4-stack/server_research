import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import * as ctrl from './casinoProfile.controller';

const router = Router();

router.get('/fields', authenticate, asyncHandler(ctrl.listProfileFields));
router.post('/fields', authenticate, asyncHandler(ctrl.createProfileField));
router.put('/fields/:id', authenticate, asyncHandler(ctrl.updateProfileField));
router.delete('/fields/:id', authenticate, asyncHandler(ctrl.deleteProfileField));

router.get('/profile-values', authenticate, asyncHandler(ctrl.getAllProfileValues));
router.get('/casinos/:casinoId/profile', authenticate, asyncHandler(ctrl.getCasinoProfile));
router.put('/casinos/:casinoId/profile', authenticate, asyncHandler(ctrl.upsertCasinoProfile));
router.get('/casinos/:casinoId/profile/history', authenticate, asyncHandler(ctrl.getCasinoProfileHistory));

export default router;
