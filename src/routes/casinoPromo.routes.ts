import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as casinoPromoController from '../controllers/casinoPromo.controller';

const router = Router();

router.get('/promos', authenticate, casinoPromoController.getAllPromos);
router.get('/promos/export', authenticate, casinoPromoController.exportPromosXlsx);

router.get('/casinos/:casinoId/promos', authenticate, casinoPromoController.listCasinoPromos);
router.post('/casinos/:casinoId/promos', authenticate, casinoPromoController.createCasinoPromo);
router.put('/casinos/:casinoId/promos/:id', authenticate, casinoPromoController.updateCasinoPromo);
router.delete('/casinos/:casinoId/promos/:id', authenticate, casinoPromoController.deleteCasinoPromo);
router.post('/casinos/:casinoId/promos/:promoId/images', authenticate, casinoPromoController.uploadPromoImages);
router.get('/casinos/:casinoId/promos/:promoId/images', authenticate, casinoPromoController.getPromoImages);
router.delete('/casinos/:casinoId/promos/:promoId/images/:imageId', authenticate, casinoPromoController.deletePromoImage);

export default router;
