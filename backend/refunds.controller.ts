import type { Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';

async function databaseStatus(): Promise<{
  ok: boolean;
  businessCount: number | null;
}> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const businessCount = await prisma.business.count();

    return {
      ok: true,
      businessCount
    };
  } catch (error) {
    console.error('Database health check failed:', error);

    return {
      ok: false,
      businessCount: null
    };
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

  res.status(db.ok ? 200 : 503).json({
    ok: db.ok,
    service: env.appName,
    apiPrefix: env.apiPrefix,
    environment: env.nodeEnv,
    database: db.ok ? 'ok' : 'error',
    businessCount: db.businessCount,
    tenant: req.tenant ?? null,
    timestamp: new Date().toISOString()
  });
}

export async function databaseHealthCheck(_req: Request, res: Response): Promise<void> {
  const db = await databaseStatus();

  res.status(db.ok ? 200 : 503).json({
    ok: db.ok,
    service: env.appName,
    environment: env.nodeEnv,
    database: db.ok ? 'ok' : 'error',
    checks: {
      prismaConnection: db.ok,
      postgresQuery: db.ok,
      businessesTable: db.ok
    },
    businessCount: db.businessCount,
    timestamp: new Date().toISOString()
  });
}
