import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import {
  getSelectorsByCasino,
  createSelector,
  updateSelector,
  deleteSelector,
} from './slotSelector.controller';
import {
  getAllScreenshots,
  getScreenshotsBySelector,
  takeScreenshot,
  getScreenshotsByCasino,
} from './slotScreenshot.controller';

const router = Router();

router.get('/casinos/:casinoId/selectors', authenticate, asyncHandler(getSelectorsByCasino));
router.post('/casinos/:casinoId/selectors', authenticate, asyncHandler(createSelector));
router.put('/selectors/:id', authenticate, asyncHandler(updateSelector));
router.delete('/selectors/:id', authenticate, asyncHandler(deleteSelector));

router.get('/screenshots', authenticate, asyncHandler(getAllScreenshots));
router.get(
  '/casinos/:casinoId/screenshots',
  authenticate,
  asyncHandler(getScreenshotsByCasino),
);
router.get(
  '/selectors/:selectorId/screenshots',
  authenticate,
  asyncHandler(getScreenshotsBySelector),
);
router.post(
  '/selectors/:selectorId/screenshots',
  authenticate,
  asyncHandler(takeScreenshot),
);

export default router;

