import type { NextFunction, Request, Response } from 'express';
import { verifyAuthToken } from '../utils/auth-token.js';

const HEALTH_PATHS = new Set([
  '/health',
  '/health/db',
  '/api/v1/health',
  '/api/v1/health/db'
]);

const PUBLIC_AUTH_PATHS = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/logout'
]);

function getBearerToken(req: Request): string | null {
  const header = req.header('authorization') || '';

  if (!header.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const token = header.slice(7).trim();

  return token || null;
}

export function tenantMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (HEALTH_PATHS.has(req.path)) {
    req.tenant = {
      businessId: null,
      source: 'system'
    };

    return next();
  }

  const token = getBearerToken(req);

  if (token) {
    const payload = verifyAuthToken(token);

    if (payload) {
      req.tenant = {
        businessId: payload.businessId,
        businessSlug: payload.businessSlug,
        userId: payload.userId,
        source: 'auth'
      };

      return next();
    }
  }

  if (PUBLIC_AUTH_PATHS.has(req.path)) {
    req.tenant = {
      businessId: null,
      source: 'future-auth'
    };

    return next();
  }

  req.tenant = {
    businessId: null,
    source: 'future-auth'
  };

  next();
}
