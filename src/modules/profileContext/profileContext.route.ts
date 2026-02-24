import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import * as ctrl from './profileContext.controller';

const router = Router();
router.get('/', authenticate, asyncHandler(ctrl.getAllProfileContexts));
router.get('/:id', authenticate, asyncHandler(ctrl.getProfileContextById));
router.post('/', authenticate, asyncHandler(ctrl.createProfileContext));
router.put('/:id', authenticate, asyncHandler(ctrl.updateProfileContext));
router.delete('/:id', authenticate, asyncHandler(ctrl.deleteProfileContext));
export default router;
