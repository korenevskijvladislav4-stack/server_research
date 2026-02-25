import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import * as ctrl from './chat.controller';

const router = Router();

router.get('/chat/sessions', authenticate, asyncHandler(ctrl.listChats));
router.post('/chat/sessions', authenticate, asyncHandler(ctrl.createChat));
router.get('/chat/sessions/:sessionId', authenticate, asyncHandler(ctrl.getChat));
router.delete('/chat/sessions/:sessionId', authenticate, asyncHandler(ctrl.deleteChat));
router.post('/chat/sessions/:sessionId/messages', authenticate, asyncHandler(ctrl.sendMessage));

export default router;
