import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { getGeos, createGeo } from '../controllers/geo.controller';

const router = Router();

router.get('/geos', authenticate, getGeos);
router.post('/geos', authenticate, createGeo);

export default router;

