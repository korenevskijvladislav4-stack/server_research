import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import * as ctrl from './profileField.controller';

const router = Router();
router.get('/', authenticate, asyncHandler(ctrl.getAllProfileFields));
router.get('/:id', authenticate, asyncHandler(ctrl.getProfileFieldById));
router.post('/', authenticate, asyncHandler(ctrl.createProfileField));
router.put('/:id', authenticate, asyncHandler(ctrl.updateProfileField));
router.delete('/:id', authenticate, asyncHandler(ctrl.deleteProfileField));
export default router;
