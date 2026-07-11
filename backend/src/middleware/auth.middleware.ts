import type { NextFunction, Request, Response } from 'express';
import { verifyAuthToken } from '../utils/auth-token.js';

function getBearerToken(req: Request): string | null {
  const header = req.header('authorization') || '';

  if (!header.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const token = header.slice(7).trim();

  return token || null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = getBearerToken(req);

  if (!token) {
    res.status(401).json({
      ok: false,
      error: {
        message: 'Authentication required'
      }
    });
    return;
  }

  const payload = verifyAuthToken(token);

  if (!payload) {
    res.status(401).json({
      ok: false,
      error: {
        message: 'Invalid or expired token'
      }
    });
    return;
  }

  req.tenant = {
    businessId: payload.businessId,
    businessSlug: payload.businessSlug,
    userId: payload.userId,
    source: 'auth'
  };

  next();
}
