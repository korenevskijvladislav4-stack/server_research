import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import { loyaltyAiImageUpload, loyaltyStatusImageUpload } from './loyaltyUpload.middleware';
import * as ctrl from './casinoLoyalty.controller';

const router = Router();

router.get('/casinos/:casinoId/loyalty-programs', authenticate, asyncHandler(ctrl.listLoyaltyPrograms));
router.get(
  '/casinos/:casinoId/loyalty-programs/:programId',
  authenticate,
  asyncHandler(ctrl.getLoyaltyProgram),
);
router.post('/casinos/:casinoId/loyalty-programs', authenticate, asyncHandler(ctrl.createLoyaltyProgram));
router.put(
  '/casinos/:casinoId/loyalty-programs/:programId',
  authenticate,
  asyncHandler(ctrl.updateLoyaltyProgram),
);
router.delete(
  '/casinos/:casinoId/loyalty-programs/:programId',
  authenticate,
  asyncHandler(ctrl.deleteLoyaltyProgram),
);

router.post('/casinos/:casinoId/loyalty-programs/format-markdown', authenticate, asyncHandler(ctrl.formatMarkdown));

router.post(
  '/casinos/:casinoId/loyalty-programs/ai-from-image',
  authenticate,
  (req, res, next) => {
    loyaltyAiImageUpload(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : 'Ошибка загрузки файла';
        res.status(400).json({ error: msg });
        return;
      }
      next();
    });
  },
  asyncHandler(ctrl.aiLoyaltyFromImage),
);

router.post(
  '/casinos/:casinoId/loyalty-programs/ai-status-from-image',
  authenticate,
  (req, res, next) => {
    loyaltyAiImageUpload(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : 'Ошибка загрузки файла';
        res.status(400).json({ error: msg });
        return;
      }
      next();
    });
  },
  asyncHandler(ctrl.aiLoyaltyStatusFromImage),
);

router.post(
  '/casinos/:casinoId/loyalty-programs/:programId/statuses/:statusId/images',
  authenticate,
  (req, res, next) => {
    loyaltyStatusImageUpload(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : 'Ошибка загрузки файла';
        res.status(400).json({ error: msg });
        return;
      }
      next();
    });
  },
  asyncHandler(ctrl.uploadLoyaltyStatusImages),
);

router.get(
  '/casinos/:casinoId/loyalty-programs/:programId/statuses/:statusId/images',
  authenticate,
  asyncHandler(ctrl.getLoyaltyStatusImages),
);

router.delete(
  '/casinos/:casinoId/loyalty-program-status-images/:imageId',
  authenticate,
  asyncHandler(ctrl.deleteLoyaltyStatusImage),
);

export default router;
