import rateLimit from 'express-rate-limit';

/** Limit auth attempts per IP: 20 per 15 minutes */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Слишком много попыток входа. Попробуйте позже.', code: 'RATE_LIMIT' },
  standardHeaders: true,
  skipSuccessfulRequests: true,
});
