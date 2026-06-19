import type { NextFunction, Request, Response } from 'express';

const HEALTH_PATHS = new Set(['/health', '/api/v1/health']);

export function tenantMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (HEALTH_PATHS.has(req.path)) {
    req.tenant = { businessId: null, source: 'system' };
    return next();
  }

  const headerValue = req.header('x-business-id') || req.header('x-tenant-id') || '';
  const businessId = headerValue.trim() || null;

  // Phase 2 placeholder:
  // - During auth phase, businessId will be resolved from JWT/session.
  // - For early protected APIs, x-business-id can be used only in development/testing.
  // - Every Prisma query must filter by req.tenant.businessId once API modules are added.
  req.tenant = {
    businessId,
    source: businessId ? 'header' : 'future-auth'
  };

  next();
}
