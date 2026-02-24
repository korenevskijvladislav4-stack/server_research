import { body, param } from 'express-validator';
import { ValidationChain } from 'express-validator';

export const addProviderToCasinoValidators: ValidationChain[] = [
  param('casinoId').isInt({ min: 1 }).withMessage('casinoId должен быть положительным числом'),
  body('geo').trim().notEmpty().withMessage('GEO обязателен'),
  body('provider_id').optional().isInt({ min: 1 }).withMessage('provider_id должен быть положительным числом'),
  body('provider_name').optional().trim().isLength({ max: 255 }),
];
