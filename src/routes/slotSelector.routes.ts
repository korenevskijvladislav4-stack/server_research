import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  getSelectorsByCasino,
  createSelector,
  updateSelector,
  deleteSelector,
} from '../controllers/slotSelector.controller';
import {
  getAllScreenshots,
  getScreenshotsBySelector,
  takeScreenshot,
  getScreenshotsByCasino,
} from '../controllers/slotScreenshot.controller';

const router = Router();

// Selector CRUD
router.get('/casinos/:casinoId/selectors', authenticate, getSelectorsByCasino);
router.post('/casinos/:casinoId/selectors', authenticate, createSelector);
router.put('/selectors/:id', authenticate, updateSelector);
router.delete('/selectors/:id', authenticate, deleteSelector);

// Screenshots
router.get('/screenshots', authenticate, getAllScreenshots);
router.get('/casinos/:casinoId/screenshots', authenticate, getScreenshotsByCasino);
router.get('/selectors/:selectorId/screenshots', authenticate, getScreenshotsBySelector);
router.post('/selectors/:selectorId/screenshots', authenticate, takeScreenshot);

export default router;
