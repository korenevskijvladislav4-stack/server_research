import { body } from 'express-validator';
import { ValidationChain } from 'express-validator';

export const createGeoValidators: ValidationChain[] = [
  body('code').trim().notEmpty().withMessage('Код GEO обязателен').isLength({ max: 20 }),
  body('name').optional().trim().isLength({ max: 255 }),
];
