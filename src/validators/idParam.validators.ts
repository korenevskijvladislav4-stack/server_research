import { param, ValidationChain } from 'express-validator';

export const idParamValidators: ValidationChain[] = [
  param('id').isInt({ min: 1 }).withMessage('Некорректный id'),
];
