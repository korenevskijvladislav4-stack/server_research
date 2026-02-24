import { body, param } from 'express-validator';
import { ValidationChain } from 'express-validator';

export const createUserValidators: ValidationChain[] = [
  body('username').trim().notEmpty().withMessage('Имя пользователя обязательно').isLength({ min: 2, max: 100 }),
  body('email').trim().notEmpty().withMessage('Email обязателен').isEmail().withMessage('Некорректный email').normalizeEmail(),
  body('password').notEmpty().withMessage('Пароль обязателен').isLength({ min: 6 }).withMessage('Пароль не менее 6 символов'),
  body('role').optional().isIn(['admin', 'user']).withMessage('role: admin или user'),
  body('is_active').optional().isBoolean().withMessage('is_active должен быть boolean'),
];

export const updateUserValidators: ValidationChain[] = [
  param('id').isInt({ min: 1 }).withMessage('id должен быть положительным числом'),
  body('username').optional().trim().isLength({ min: 2, max: 100 }),
  body('email').optional().trim().isEmail().normalizeEmail(),
  body('password').optional().isLength({ min: 6 }).withMessage('Пароль не менее 6 символов'),
  body('role').optional().isIn(['admin', 'user']),
  body('is_active').optional().isBoolean(),
];
