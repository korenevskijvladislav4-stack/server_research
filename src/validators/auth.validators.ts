import { body, ValidationChain } from 'express-validator';

export const registerValidators: ValidationChain[] = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Имя пользователя обязательно')
    .isLength({ min: 2, max: 100 })
    .withMessage('Имя пользователя от 2 до 100 символов'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email обязателен')
    .isEmail()
    .withMessage('Некорректный email')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Пароль обязателен')
    .isLength({ min: 6 })
    .withMessage('Пароль не менее 6 символов'),
];

export const loginValidators: ValidationChain[] = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Укажите email')
    .isEmail()
    .withMessage('Некорректный email')
    .normalizeEmail(),
  body('password').notEmpty().withMessage('Укажите пароль'),
];
