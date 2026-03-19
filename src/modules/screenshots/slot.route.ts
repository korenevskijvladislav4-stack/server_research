import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import { getSlotsByCasino, parseSlotsFromCasino, deleteSlot } from './slot.controller';

const router = Router();

router.get('/casinos/:casinoId/slots', authenticate, asyncHandler(getSlotsByCasino));

router.post('/casinos/:casinoId/slots/parse', authenticate, asyncHandler(parseSlotsFromCasino));

router.delete('/slots/:id', authenticate, asyncHandler(deleteSlot));

export default router;

