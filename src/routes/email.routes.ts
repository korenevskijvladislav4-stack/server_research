import { Router } from 'express';
import * as emailController from '../controllers/email.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticate, emailController.getAllEmails);
router.get('/:id', authenticate, emailController.getEmailById);
router.post('/sync', authenticate, emailController.syncEmails);
router.patch('/:id/read', authenticate, emailController.markEmailAsRead);
router.patch('/:id/link-casino', authenticate, emailController.linkEmailToCasino);
router.patch('/:id/link-promo', authenticate, emailController.linkEmailToPromo);
router.get(
  '/by-casino/:casinoId',
  authenticate,
  emailController.getEmailsByCasinoNameMatch
);

export default router;
