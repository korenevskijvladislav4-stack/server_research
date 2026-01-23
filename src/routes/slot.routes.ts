import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  getSlotsByCasino,
  parseSlotsFromCasino,
  deleteSlot,
} from '../controllers/slot.controller';

const router = Router();

// Get all slots for a casino (optionally filtered by GEO)
router.get('/casinos/:casinoId/slots', authenticate, getSlotsByCasino);

// Parse slots from casino homepage for multiple GEOs
router.post('/casinos/:casinoId/slots/parse', authenticate, parseSlotsFromCasino);

// Delete a slot
router.delete('/slots/:id', authenticate, deleteSlot);

export default router;
