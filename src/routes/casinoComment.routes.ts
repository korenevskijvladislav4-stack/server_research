import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as commentController from '../controllers/casinoComment.controller';

const router = Router();

// Get all comments for a casino
router.get('/casinos/:casinoId/comments', authenticate, commentController.getCommentsByCasino);

// Create a new comment
router.post('/casinos/:casinoId/comments', authenticate, commentController.createComment);

// Upload image for a comment
router.post(
  '/casinos/:casinoId/comments/:commentId/images',
  authenticate,
  commentController.uploadCommentImage,
);

// Get all images for a casino
router.get('/casinos/:casinoId/images', authenticate, commentController.getCasinoImages);

// Update a comment
router.put('/comments/:id', authenticate, commentController.updateComment);

// Delete a comment
router.delete('/comments/:id', authenticate, commentController.deleteComment);

export default router;
