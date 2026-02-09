import { Router } from 'express';
import * as ctrl from '../controllers/imapAccount.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Gmail OAuth (must be before /:id routes)
router.get('/gmail/status', authenticate, ctrl.gmailOAuthStatus);
router.get('/gmail/auth-url', authenticate, ctrl.gmailGetAuthUrl);
router.post('/gmail/callback', authenticate, ctrl.gmailCallback);

// CRUD
router.get('/', authenticate, ctrl.listImapAccounts);
router.get('/:id', authenticate, ctrl.getImapAccountById);
router.post('/', authenticate, ctrl.createImapAccount);
router.put('/:id', authenticate, ctrl.updateImapAccount);
router.delete('/:id', authenticate, ctrl.deleteImapAccount);

// Test & sync
router.post('/:id/test', authenticate, ctrl.testImapAccount);

export default router;
