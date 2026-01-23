import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as casinoProfileController from '../controllers/casinoProfile.controller';

const router = Router();

// OLD Field definitions for casino_profile_fields (legacy system)
router.get('/fields', authenticate, casinoProfileController.listProfileFields);
router.post('/fields', authenticate, casinoProfileController.createProfileField);
router.put('/fields/:id', authenticate, casinoProfileController.updateProfileField);
router.delete('/fields/:id', authenticate, casinoProfileController.deleteProfileField);

// Casino profile values
router.get('/profile-values', authenticate, casinoProfileController.getAllProfileValues);
router.get('/casinos/:casinoId/profile', authenticate, casinoProfileController.getCasinoProfile);
router.put('/casinos/:casinoId/profile', authenticate, casinoProfileController.upsertCasinoProfile);
router.get('/casinos/:casinoId/profile/history', authenticate, casinoProfileController.getCasinoProfileHistory);

export default router;

