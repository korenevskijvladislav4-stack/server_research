import { Router } from 'express';
import * as casinoController from '../controllers/casino.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/', casinoController.getAllCasinos);
router.get('/:id', casinoController.getCasinoById);
router.post('/', authenticate, casinoController.createCasino);
router.put('/:id', authenticate, casinoController.updateCasino);
router.delete('/:id', authenticate, casinoController.deleteCasino);

export default router;
