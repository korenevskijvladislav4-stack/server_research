import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as casinoBonusController from '../controllers/casinoBonus.controller';

const router = Router();

// Global bonuses list with filters
router.get('/bonuses', authenticate, casinoBonusController.getAllBonuses);

router.get('/casinos/:casinoId/bonuses', authenticate, casinoBonusController.listCasinoBonuses);
router.post('/casinos/:casinoId/bonuses', authenticate, casinoBonusController.createCasinoBonus);
router.put('/casinos/:casinoId/bonuses/:id', authenticate, casinoBonusController.updateCasinoBonus);
router.delete('/casinos/:casinoId/bonuses/:id', authenticate, casinoBonusController.deleteCasinoBonus);

// Bonus images
router.post('/casinos/:casinoId/bonuses/:bonusId/images', authenticate, casinoBonusController.uploadBonusImages);
router.get('/casinos/:casinoId/bonuses/:bonusId/images', authenticate, casinoBonusController.getBonusImages);
router.delete('/casinos/:casinoId/bonuses/:bonusId/images/:imageId', authenticate, casinoBonusController.deleteBonusImage);

export default router;
