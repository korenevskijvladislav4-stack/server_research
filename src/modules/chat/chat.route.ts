import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/authorize.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import * as ctrl from './chat.controller';
import * as modelCtrl from './chatModel.controller';
import {
  createChatAiModelValidators,
  updateChatAiModelValidators,
  deleteChatAiModelValidators,
} from '../../validators/chatModel.validators';

const router = Router();

router.get('/chat/config', authenticate, asyncHandler(ctrl.getChatConfig));

router.get('/chat/models', authenticate, authorize('admin'), asyncHandler(modelCtrl.listChatAiModelsAdmin));
router.post(
  '/chat/models',
  authenticate,
  authorize('admin'),
  validate(createChatAiModelValidators),
  asyncHandler(modelCtrl.createChatAiModel),
);
router.patch(
  '/chat/models/:id',
  authenticate,
  authorize('admin'),
  validate(updateChatAiModelValidators),
  asyncHandler(modelCtrl.updateChatAiModel),
);
router.delete(
  '/chat/models/:id',
  authenticate,
  authorize('admin'),
  validate(deleteChatAiModelValidators),
  asyncHandler(modelCtrl.deleteChatAiModel),
);
router.get('/chat/sessions', authenticate, asyncHandler(ctrl.listChats));
router.post('/chat/sessions', authenticate, asyncHandler(ctrl.createChat));
router.get('/chat/sessions/:sessionId', authenticate, asyncHandler(ctrl.getChat));
router.delete('/chat/sessions/:sessionId', authenticate, asyncHandler(ctrl.deleteChat));
router.post('/chat/sessions/:sessionId/messages', authenticate, asyncHandler(ctrl.sendMessage));
router.post(
  '/chat/sessions/:sessionId/messages/stream',
  authenticate,
  asyncHandler(ctrl.sendMessageStream),
);

export default router;
