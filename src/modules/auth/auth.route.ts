import { Router } from 'express';
import * as authController from './auth.controller';
import * as usersController from './users.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { authRateLimiter } from '../../middleware/rateLimit.middleware';
import { registerValidators, loginValidators } from '../../validators/auth.validators';
import { createUserValidators, updateUserValidators } from '../../validators/user.validators';

const router = Router();

router.post('/register', authRateLimiter, validate(registerValidators), asyncHandler(authController.register));
router.post('/login', authRateLimiter, validate(loginValidators), asyncHandler(authController.login));
router.get('/users', authenticate, asyncHandler(usersController.getAllUsers));
router.post('/users', authenticate, validate(createUserValidators), asyncHandler(usersController.createUser));
router.put('/users/:id', authenticate, validate(updateUserValidators), asyncHandler(usersController.updateUser));
router.delete('/users/:id', authenticate, asyncHandler(usersController.deleteUser));

export default router;
