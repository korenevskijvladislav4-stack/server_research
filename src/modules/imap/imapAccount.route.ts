import { Router } from 'express';
import * as ctrl from './imapAccount.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';

const router = Router();

router.get('/gmail/status', authenticate, asyncHandler(ctrl.gmailOAuthStatus));
router.get('/gmail/auth-url', authenticate, asyncHandler(ctrl.gmailGetAuthUrl));
router.post('/gmail/callback', authenticate, asyncHandler(ctrl.gmailCallback));

router.get('/', authenticate, asyncHandler(ctrl.listImapAccounts));
router.get('/:id', authenticate, asyncHandler(ctrl.getImapAccountById));
router.post('/', authenticate, asyncHandler(ctrl.createImapAccount));
router.put('/:id', authenticate, asyncHandler(ctrl.updateImapAccount));
router.delete('/:id', authenticate, asyncHandler(ctrl.deleteImapAccount));

router.post('/:id/test', authenticate, asyncHandler(ctrl.testImapAccount));

export default router;

