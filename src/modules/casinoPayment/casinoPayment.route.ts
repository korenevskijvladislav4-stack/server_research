import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import { paymentImageUpload } from './paymentUpload.middleware';
import * as ctrl from './casinoPayment.controller';

const router = Router();

router.get('/payments', authenticate, asyncHandler(ctrl.getAllPayments));
router.get('/payments/export', authenticate, asyncHandler(ctrl.exportPaymentsXlsx));

router.get('/casinos/:casinoId/payments', authenticate, asyncHandler(ctrl.listCasinoPayments));
router.post('/casinos/:casinoId/payments', authenticate, asyncHandler(ctrl.createCasinoPayment));
router.put('/casinos/:casinoId/payments/:id', authenticate, asyncHandler(ctrl.updateCasinoPayment));
router.delete('/casinos/:casinoId/payments/:id', authenticate, asyncHandler(ctrl.deleteCasinoPayment));

router.post(
  '/casinos/:casinoId/payments/:paymentId/images',
  authenticate,
  (req, res, next) => {
    paymentImageUpload(req, res, (err: any) => {
      if (err) {
        res.status(400).json({ error: err.message || 'Failed to upload images' });
        return;
      }
      next();
    });
  },
  asyncHandler(ctrl.uploadPaymentImages)
);
router.get(
  '/casinos/:casinoId/payments/:paymentId/images',
  authenticate,
  asyncHandler(ctrl.getPaymentImages)
);
router.delete(
  '/casinos/:casinoId/payments/:paymentId/images/:imageId',
  authenticate,
  asyncHandler(ctrl.deletePaymentImage)
);

export default router;
