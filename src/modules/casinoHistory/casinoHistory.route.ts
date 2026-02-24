import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import { listHistory } from './casinoHistory.controller';

const router = Router();
router.get('/casinos/:casinoId/history', authenticate, asyncHandler(listHistory));
export default router;
