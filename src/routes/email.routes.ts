import { Router } from 'express';
import * as emailController from '../controllers/email.controller';
import * as emailTopicController from '../controllers/emailTopic.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Literal paths first (before /:id), otherwise "recipients" and "by-casino" are matched as id
router.get('/', authenticate, emailController.getAllEmails);
router.get('/analytics', authenticate, emailController.getEmailAnalytics);
router.get('/recipients', authenticate, emailController.getEmailRecipients);
router.get('/export', authenticate, emailController.exportEmailsXlsx);
router.get('/by-casino/:casinoId', authenticate, emailController.getEmailsByCasinoNameMatch);
router.get('/topics', authenticate, emailTopicController.getEmailTopics);
router.post('/topics', authenticate, emailTopicController.createEmailTopic);
router.put('/topics/:id', authenticate, emailTopicController.updateEmailTopic);
router.delete('/topics/:id', authenticate, emailTopicController.deleteEmailTopic);
router.get('/:id', authenticate, emailController.getEmailById);

router.post('/sync', authenticate, emailController.syncEmails);
router.post('/relink', authenticate, emailController.relinkEmails);
router.post('/:id/summarize', authenticate, emailController.requestSummary);
router.post('/:id/screenshot', authenticate, emailController.requestScreenshot);
router.patch('/:id/read', authenticate, emailController.markEmailAsRead);
router.patch('/:id/link-casino', authenticate, emailController.linkEmailToCasino);

export default router;
