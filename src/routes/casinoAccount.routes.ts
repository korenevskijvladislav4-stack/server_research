import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as casinoAccountController from '../controllers/casinoAccount.controller';
import * as accountTransactionController from '../controllers/accountTransaction.controller';

const router = Router();

router.get('/accounts/transactions/export', authenticate, accountTransactionController.exportTransactionsXlsx);
router.get('/accounts/transactions', authenticate, accountTransactionController.getTransactions);
router.get('/accounts/:accountId/totals', authenticate, accountTransactionController.getAccountTotals);
router.post('/accounts/:accountId/transactions', authenticate, accountTransactionController.createTransaction);
router.get('/accounts', authenticate, casinoAccountController.getAllCasinoAccounts);
router.get('/casinos/:casinoId/accounts', authenticate, casinoAccountController.getCasinoAccounts);
router.post('/casinos/:casinoId/accounts', authenticate, casinoAccountController.createCasinoAccount);
router.put('/accounts/:id', authenticate, casinoAccountController.updateCasinoAccount);
router.delete('/accounts/:id', authenticate, casinoAccountController.deleteCasinoAccount);

export default router;
