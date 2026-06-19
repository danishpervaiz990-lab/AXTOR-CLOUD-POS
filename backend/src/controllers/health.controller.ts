import type { Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';

async function databaseStatus(): Promise<'ok' | 'error'> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'ok';
  } catch {
    return 'error';
  }
}

export async function healthCheck(_req: Request, res: Response): Promise<void> {
  res.json({
    ok: true,
    service: env.appName,
    environment: env.nodeEnv,
    timestamp: new Date().toISOString()
  });
}

export async function apiHealthCheck(req: Request, res: Response): Promise<void> {
  const db = await databaseStatus();
  res.status(db === 'ok' ? 200 : 503).json({
    ok: db === 'ok',
    service: env.appName,
    apiPrefix: env.apiPrefix,
    database: db,
    tenant: req.tenant ?? null,
    timestamp: new Date().toISOString()
  });
}
