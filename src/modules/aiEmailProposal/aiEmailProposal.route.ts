import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/authorize.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import * as ctrl from './aiEmailProposal.controller';

const router = Router();

/** Не использовать router.use(authenticate) без пути: роутер смонтирован на `/api/v1`, иначе любой
 *  непойманный запрос вида `/api/v1/...` доходит сюда и отдаёт 401 без токена (например битый URL картинки). */
router.get('/ai-email-proposals', authenticate, asyncHandler(ctrl.listProposals));
router.post(
  '/ai-email-proposals/dev/trigger',
  authenticate,
  authorize('admin'),
  asyncHandler(ctrl.devTriggerProposal),
);
router.get('/ai-email-proposals/:id', authenticate, asyncHandler(ctrl.getProposal));
router.post('/ai-email-proposals/:id/viewed', authenticate, asyncHandler(ctrl.markProposalViewed));
router.post(
  '/ai-email-proposals/:id/reject',
  authenticate,
  authorize('admin'),
  asyncHandler(ctrl.rejectProposal),
);
router.post(
  '/ai-email-proposals/:id/approve-bonus',
  authenticate,
  authorize('admin'),
  asyncHandler(ctrl.approveBonusProposal),
);
router.post(
  '/ai-email-proposals/:id/approve-promo',
  authenticate,
  authorize('admin'),
  asyncHandler(ctrl.approvePromoProposal),
);

export default router;
