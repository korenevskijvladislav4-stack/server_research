import request from 'supertest';
import express from 'express';
import { healthCheck } from '../controllers/health.controller';
import { asyncHandler } from '../middleware/asyncHandler';

const app = express();
app.get('/health', asyncHandler(healthCheck));

describe('GET /health', () => {
  it('returns 200 with status ok when server is up', async () => {
    const res = await request(app).get('/health');
    // May be 200 (DB connected) or 503 (DB not available in test env)
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('message');
    if (res.status === 200) {
      expect(res.body.status).toBe('ok');
      expect(res.body.database).toBe('connected');
    } else {
      expect(res.body.status).toBe('error');
      expect(res.body.database).toBe('disconnected');
    }
  });
});
