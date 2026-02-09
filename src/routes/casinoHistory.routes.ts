import { Router } from 'express';
import * as ctrl from '../controllers/casinoHistory.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/casinos/:casinoId/history', authenticate, ctrl.listHistory);

export default router;
