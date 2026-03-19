import { Request, Response } from 'express';
import prisma from '../lib/prisma';

export async function healthCheck(_req: Request, res: Response): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', message: 'Server is running', database: 'connected' });
  } catch {
    res.status(503).json({
      status: 'error',
      message: 'Service Unavailable',
      database: 'disconnected',
    });
  }
}
