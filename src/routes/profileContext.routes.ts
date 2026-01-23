import { Router } from 'express';
import {
  getAllProfileContexts,
  getProfileContextById,
  createProfileContext,
  updateProfileContext,
  deleteProfileContext,
} from '../controllers/profileContext.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticate, getAllProfileContexts);
router.get('/:id', authenticate, getProfileContextById);
router.post('/', authenticate, createProfileContext);
router.put('/:id', authenticate, updateProfileContext);
router.delete('/:id', authenticate, deleteProfileContext);

export default router;
