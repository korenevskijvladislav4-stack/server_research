import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import * as userController from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/users', authenticate, userController.getAllUsers);
router.post('/users', authenticate, userController.createUser);
router.put('/users/:id', authenticate, userController.updateUser);
router.delete('/users/:id', authenticate, userController.deleteUser);

export default router;
