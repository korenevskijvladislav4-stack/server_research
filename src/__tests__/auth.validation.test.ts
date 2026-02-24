import { validationResult } from 'express-validator';
import { loginValidators, registerValidators } from '../validators/auth.validators';

const runValidators = async (validators: typeof loginValidators, data: Record<string, string>) => {
  const req: any = { body: data };
  for (const v of validators) {
    await v.run(req);
  }
  return validationResult(req);
};

describe('Auth validators', () => {
  describe('loginValidators', () => {
    it('accepts valid email and password', async () => {
      const result = await runValidators(loginValidators, {
        email: 'user@example.com',
        password: 'secret123',
      });
      expect(result.isEmpty()).toBe(true);
    });

    it('rejects empty email', async () => {
      const result = await runValidators(loginValidators, { email: '', password: 'secret' });
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some((e) => e.msg?.includes('email'))).toBe(true);
    });

    it('rejects invalid email', async () => {
      const result = await runValidators(loginValidators, { email: 'not-an-email', password: 'secret' });
      expect(result.isEmpty()).toBe(false);
    });
  });

  describe('registerValidators', () => {
    it('accepts valid username, email, password', async () => {
      const result = await runValidators(registerValidators, {
        username: 'john',
        email: 'john@example.com',
        password: 'password123',
      });
      expect(result.isEmpty()).toBe(true);
    });

    it('rejects short password', async () => {
      const result = await runValidators(registerValidators, {
        username: 'john',
        email: 'john@example.com',
        password: '12345',
      });
      expect(result.isEmpty()).toBe(false);
      expect(result.array().some((e) => String(e.msg).includes('6'))).toBe(true);
    });
  });
});
