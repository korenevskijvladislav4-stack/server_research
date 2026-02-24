import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import * as tagController from './tag.controller';

const router = Router();

router.get('/tags', authenticate, asyncHandler(tagController.listTags));
router.post('/tags', authenticate, asyncHandler(tagController.createTag));
router.delete('/tags/:id', authenticate, asyncHandler(tagController.deleteTag));
router.get('/casino-tags', authenticate, asyncHandler(tagController.getAllCasinoTags));
router.get('/casinos/:casinoId/tags', authenticate, asyncHandler(tagController.getCasinoTags));
router.put('/casinos/:casinoId/tags', authenticate, asyncHandler(tagController.setCasinoTags));

export default router;
