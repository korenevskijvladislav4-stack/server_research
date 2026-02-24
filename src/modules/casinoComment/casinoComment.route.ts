import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import { commentImageUpload } from './commentUpload.middleware';
import * as ctrl from './casinoComment.controller';

const router = Router();

router.get('/casinos/:casinoId/comments', authenticate, asyncHandler(ctrl.getCommentsByCasino));
router.post('/casinos/:casinoId/comments', authenticate, asyncHandler(ctrl.createComment));
router.post(
  '/casinos/:casinoId/comments/:commentId/images',
  authenticate,
  (req, res, next) => {
    commentImageUpload(req, res, (err: any) => {
      if (err) {
        res.status(400).json({ error: err.message || 'Failed to upload image' });
        return;
      }
      next();
    });
  },
  asyncHandler(ctrl.uploadCommentImage)
);
router.get('/casinos/:casinoId/images', authenticate, asyncHandler(ctrl.getCasinoImages));
router.put('/comments/:id', authenticate, asyncHandler(ctrl.updateComment));
router.delete('/comments/:id', authenticate, asyncHandler(ctrl.deleteComment));

export default router;
