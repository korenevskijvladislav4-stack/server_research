import { Router } from 'express';
import * as promoController from '../controllers/promo.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/', promoController.getAllPromos);
router.get('/:id', promoController.getPromoById);
router.post('/', authenticate, promoController.createPromo);
router.put('/:id', authenticate, promoController.updatePromo);
router.delete('/:id', authenticate, promoController.deletePromo);

export default router;
