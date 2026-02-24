import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import * as casinoAccountController from './casinoAccount.controller';
import * as accountTransactionController from './accountTransaction.controller';

const router = Router();

router.get(
  '/accounts/transactions/export',
  authenticate,
  asyncHandler(accountTransactionController.exportTransactionsXlsx)
);
router.get(
  '/accounts/transactions',
  authenticate,
  asyncHandler(accountTransactionController.getTransactions)
);
router.get(
  '/accounts/:accountId/totals',
  authenticate,
  asyncHandler(accountTransactionController.getAccountTotals)
);
router.post(
  '/accounts/:accountId/transactions',
  authenticate,
  asyncHandler(accountTransactionController.createTransaction)
);
router.get(
  '/accounts',
  authenticate,
  asyncHandler(casinoAccountController.getAllCasinoAccounts)
);
router.get(
  '/casinos/:casinoId/accounts',
  authenticate,
  asyncHandler(casinoAccountController.getCasinoAccounts)
);
router.post(
  '/casinos/:casinoId/accounts',
  authenticate,
  asyncHandler(casinoAccountController.createCasinoAccount)
);
router.put(
  '/accounts/:id',
  authenticate,
  asyncHandler(casinoAccountController.updateCasinoAccount)
);
router.delete(
  '/accounts/:id',
  authenticate,
  asyncHandler(casinoAccountController.deleteCasinoAccount)
);

export default router;

