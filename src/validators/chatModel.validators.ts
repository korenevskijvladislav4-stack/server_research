import { body, param, ValidationChain } from 'express-validator';

export const createChatAiModelValidators: ValidationChain[] = [
  body('model_id').trim().notEmpty().withMessage('ID модели обязателен').isLength({ max: 255 }),
  body('label').optional().trim().isLength({ max: 255 }),
  body('input_price_per_million').optional().isFloat({ min: 0 }).withMessage('Цена входа ≥ 0'),
  body('output_price_per_million').optional().isFloat({ min: 0 }).withMessage('Цена выхода ≥ 0'),
  body('is_active').optional().isBoolean(),
  body('sort_order').optional().isInt({ min: 0 }),
];

export const updateChatAiModelValidators: ValidationChain[] = [
  param('id').isInt({ min: 1 }).withMessage('Некорректный id'),
  body('model_id').optional().trim().notEmpty().isLength({ max: 255 }),
  body('label').optional().trim().isLength({ max: 255 }),
  body('input_price_per_million').optional({ nullable: true }).isFloat({ min: 0 }),
  body('output_price_per_million').optional({ nullable: true }).isFloat({ min: 0 }),
  body('is_active').optional().isBoolean(),
  body('sort_order').optional().isInt({ min: 0 }),
];

export const deleteChatAiModelValidators: ValidationChain[] = [
  param('id').isInt({ min: 1 }).withMessage('Некорректный id'),
];
