import { Router } from 'express';
import authRoutes from './auth/auth.route';
import casinoRoutes from './casinos/casino.route';

const router = Router();

router.use('/auth', authRoutes);
router.use('/casinos', casinoRoutes);

export default router;
