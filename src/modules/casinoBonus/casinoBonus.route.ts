import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import { bonusImageUpload } from './bonusUpload.middleware';
import * as ctrl from './casinoBonus.controller';

const router = Router();

router.get('/bonuses', authenticate, asyncHandler(ctrl.getAllBonuses));
router.get('/bonuses/export', authenticate, asyncHandler(ctrl.exportBonusesXlsx));

router.get('/casinos/:casinoId/bonuses', authenticate, asyncHandler(ctrl.listCasinoBonuses));
router.post('/casinos/:casinoId/bonuses', authenticate, asyncHandler(ctrl.createCasinoBonus));
router.put('/casinos/:casinoId/bonuses/:id', authenticate, asyncHandler(ctrl.updateCasinoBonus));
router.delete('/casinos/:casinoId/bonuses/:id', authenticate, asyncHandler(ctrl.deleteCasinoBonus));

router.post(
  '/casinos/:casinoId/bonuses/:bonusId/images',
  authenticate,
  (req, res, next) => {
    bonusImageUpload(req, res, (err: any) => {
      if (err) {
        res.status(400).json({ error: err.message || 'Failed to upload images' });
        return;
      }
      next();
    });
  },
  asyncHandler(ctrl.uploadBonusImages)
);
router.get(
  '/casinos/:casinoId/bonuses/:bonusId/images',
  authenticate,
  asyncHandler(ctrl.getBonusImages)
);
router.delete(
  '/casinos/:casinoId/bonuses/:bonusId/images/:imageId',
  authenticate,
  asyncHandler(ctrl.deleteBonusImage)
);

export default router;
