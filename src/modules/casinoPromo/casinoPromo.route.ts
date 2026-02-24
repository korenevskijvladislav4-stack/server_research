import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import { promoImageUpload } from './promoUpload.middleware';
import * as ctrl from './casinoPromo.controller';

const router = Router();

router.get('/promos', authenticate, asyncHandler(ctrl.getAllPromos));
router.get('/promos/export', authenticate, asyncHandler(ctrl.exportPromosXlsx));
router.get('/casinos/:casinoId/promos', authenticate, asyncHandler(ctrl.listCasinoPromos));
router.post('/casinos/:casinoId/promos', authenticate, asyncHandler(ctrl.createCasinoPromo));
router.put('/casinos/:casinoId/promos/:id', authenticate, asyncHandler(ctrl.updateCasinoPromo));
router.delete('/casinos/:casinoId/promos/:id', authenticate, asyncHandler(ctrl.deleteCasinoPromo));
router.post(
  '/casinos/:casinoId/promos/:promoId/images',
  authenticate,
  (req, res, next) => {
    promoImageUpload(req, res, (err: any) => {
      if (err) {
        res.status(400).json({ error: err.message || 'Failed to upload images' });
        return;
      }
      next();
    });
  },
  asyncHandler(ctrl.uploadPromoImages)
);
router.get('/casinos/:casinoId/promos/:promoId/images', authenticate, asyncHandler(ctrl.getPromoImages));
router.delete('/casinos/:casinoId/promos/:promoId/images/:imageId', authenticate, asyncHandler(ctrl.deletePromoImage));

export default router;
