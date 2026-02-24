import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import * as casinoController from './casino.controller';
import { createCasinoValidators, updateCasinoValidators } from '../../validators/casino.validators';

const router = Router();

router.get('/', asyncHandler(casinoController.getAllCasinos));
router.get('/:id', asyncHandler(casinoController.getCasinoById));
router.post('/', authenticate, validate(createCasinoValidators), asyncHandler(casinoController.createCasino));
router.put('/:id', authenticate, validate(updateCasinoValidators), asyncHandler(casinoController.updateCasino));
router.delete('/:id', authenticate, asyncHandler(casinoController.deleteCasino));

export default router;
