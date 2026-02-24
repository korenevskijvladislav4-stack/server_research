import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import * as emailController from './email.controller';
import * as emailTopicController from './emailTopic.controller';

const router = Router();

router.get('/', authenticate, asyncHandler(emailController.getAllEmails));
router.get('/analytics', authenticate, asyncHandler(emailController.getEmailAnalytics));
router.get('/recipients', authenticate, asyncHandler(emailController.getEmailRecipients));
router.get('/export', authenticate, asyncHandler(emailController.exportEmailsXlsx));
router.get(
  '/by-casino/:casinoId',
  authenticate,
  asyncHandler(emailController.getEmailsByCasinoNameMatch),
);

router.get('/topics', authenticate, asyncHandler(emailTopicController.getEmailTopics));
router.post('/topics', authenticate, asyncHandler(emailTopicController.createEmailTopic));
router.put('/topics/:id', authenticate, asyncHandler(emailTopicController.updateEmailTopic));
router.delete('/topics/:id', authenticate, asyncHandler(emailTopicController.deleteEmailTopic));

router.get('/:id', authenticate, asyncHandler(emailController.getEmailById));

router.post('/sync', authenticate, asyncHandler(emailController.syncEmails));
router.post('/relink', authenticate, asyncHandler(emailController.relinkEmails));
router.post('/:id/summarize', authenticate, asyncHandler(emailController.requestSummary));
router.post('/:id/screenshot', authenticate, asyncHandler(emailController.requestScreenshot));
router.patch('/:id/read', authenticate, asyncHandler(emailController.markEmailAsRead));
router.patch('/:id/link-casino', authenticate, asyncHandler(emailController.linkEmailToCasino));

export default router;

