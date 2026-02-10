import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  getAllPayments,
  exportPaymentsXlsx,
  listCasinoPayments,
  createCasinoPayment,
  updateCasinoPayment,
  deleteCasinoPayment,
  uploadPaymentImages,
  getPaymentImages,
  deletePaymentImage,
} from '../controllers/casinoPayment.controller';

const router = Router();

router.get('/payments', authenticate, getAllPayments);
router.get('/payments/export', authenticate, exportPaymentsXlsx);
router.get('/casinos/:casinoId/payments', authenticate, listCasinoPayments);
router.post('/casinos/:casinoId/payments', authenticate, createCasinoPayment);
router.put('/casinos/:casinoId/payments/:id', authenticate, updateCasinoPayment);
router.delete('/casinos/:casinoId/payments/:id', authenticate, deleteCasinoPayment);

// Payment images
router.post('/casinos/:casinoId/payments/:paymentId/images', authenticate, uploadPaymentImages);
router.get('/casinos/:casinoId/payments/:paymentId/images', authenticate, getPaymentImages);
router.delete('/casinos/:casinoId/payments/:paymentId/images/:imageId', authenticate, deletePaymentImage);

export default router;

