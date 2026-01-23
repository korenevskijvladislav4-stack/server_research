import { Router } from 'express';
import {
  getAllProfileFields,
  getProfileFieldById,
  createProfileField,
  updateProfileField,
  deleteProfileField,
} from '../controllers/profileField.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticate, getAllProfileFields);
router.get('/:id', authenticate, getProfileFieldById);
router.post('/', authenticate, createProfileField);
router.put('/:id', authenticate, updateProfileField);
router.delete('/:id', authenticate, deleteProfileField);

export default router;
