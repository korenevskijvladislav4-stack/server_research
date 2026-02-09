import { Router } from 'express';
import * as ctrl from '../controllers/tag.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Global tags
router.get('/tags', authenticate, ctrl.listTags);
router.post('/tags', authenticate, ctrl.createTag);
router.delete('/tags/:id', authenticate, ctrl.deleteTag);

// All casino → tag mappings (for list view)
router.get('/casino-tags', authenticate, ctrl.getAllCasinoTags);

// Casino ↔ Tag links
router.get('/casinos/:casinoId/tags', authenticate, ctrl.getCasinoTags);
router.put('/casinos/:casinoId/tags', authenticate, ctrl.setCasinoTags);

export default router;
