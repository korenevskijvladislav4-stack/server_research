import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/authorize.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import * as ctrl from './aiEmailProposal.controller';

const router = Router();

router.use(authenticate);

router.get('/ai-email-proposals', asyncHandler(ctrl.listProposals));
router.post('/ai-email-proposals/dev/trigger', authorize('admin'), asyncHandler(ctrl.devTriggerProposal));
router.get('/ai-email-proposals/:id', asyncHandler(ctrl.getProposal));
router.post('/ai-email-proposals/:id/viewed', asyncHandler(ctrl.markProposalViewed));
router.post('/ai-email-proposals/:id/reject', authorize('admin'), asyncHandler(ctrl.rejectProposal));
router.post('/ai-email-proposals/:id/approve-bonus', authorize('admin'), asyncHandler(ctrl.approveBonusProposal));
router.post('/ai-email-proposals/:id/approve-promo', authorize('admin'), asyncHandler(ctrl.approvePromoProposal));

export default router;
