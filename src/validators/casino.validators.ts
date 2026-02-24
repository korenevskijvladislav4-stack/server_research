import { body, param } from 'express-validator';
import { ValidationChain } from 'express-validator';

export const createCasinoValidators: ValidationChain[] = [
  body('name').trim().notEmpty().withMessage('Название казино обязательно').isLength({ max: 500 }),
];

export const updateCasinoValidators: ValidationChain[] = [
  param('id').isInt({ min: 1 }).withMessage('id должен быть положительным числом'),
  body('name').optional().trim().isLength({ max: 500 }).withMessage('Название не более 500 символов'),
];
