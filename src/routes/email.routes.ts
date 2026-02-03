import { Router } from 'express';
import * as emailController from '../controllers/email.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Literal paths first (before /:id), otherwise "recipients" and "by-casino" are matched as id
router.get('/', authenticate, emailController.getAllEmails);
router.get('/recipients', authenticate, emailController.getEmailRecipients);
router.get('/by-casino/:casinoId', authenticate, emailController.getEmailsByCasinoNameMatch);
router.get('/:id', authenticate, emailController.getEmailById);

router.post('/sync', authenticate, emailController.syncEmails);
router.patch('/:id/read', authenticate, emailController.markEmailAsRead);
router.patch('/:id/link-casino', authenticate, emailController.linkEmailToCasino);
router.patch('/:id/link-promo', authenticate, emailController.linkEmailToPromo);

export default router;
