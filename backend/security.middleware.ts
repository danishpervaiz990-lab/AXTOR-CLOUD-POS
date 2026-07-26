import type { NextFunction, Request, Response } from 'express';
import { verifyAuthToken } from '../utils/auth-token.js';
import { prisma } from '../db/prisma.js';
import { loadEntitlements } from '../services/entitlements.service.js';

const ROUTE_FEATURES: Array<[string, string]> = [
  ['/api/v1/purchases', 'purchases.*'], ['/api/v1/expenses', 'expenses.*'], ['/api/v1/accounts', 'accounts.*'], ['/api/v1/promotions', 'promotions.basic'], ['/api/v1/loyalty', 'loyalty.basic'], ['/api/v1/approvals', 'approvals.basic']
];

function entitled(features: Record<string, { enabled: boolean }>, key: string): boolean {
  if (features['*']?.enabled || features[key]?.enabled) return true;
  const parts = key.split('.');
  for (let index = parts.length - 1; index > 0; index -= 1) if (features[parts.slice(0, index).join('.') + '.*']?.enabled) return true;
  return false;
}

function getBearerToken(req: Request): string | null {
  const header = req.header('authorization') || '';

  if (!header.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const token = header.slice(7).trim();

  return token || null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
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

  if (payload.sessionId) {
    const session = await prisma.authSession.findFirst({ where: { id: payload.sessionId, businessId: payload.businessId, userId: payload.userId }, include: { user: { select: { mustChangePassword: true } } } });
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      res.status(401).json({ ok: false, error: { message: 'Session has expired or been revoked' } });
      return;
    }
    if (session.user.mustChangePassword && !req.originalUrl.startsWith('/api/v1/auth/change-password') && !req.originalUrl.startsWith('/api/v1/auth/logout') && !req.originalUrl.startsWith('/api/v1/auth/me')) {
      res.status(403).json({ ok: false, error: { message: 'Password change required', details: { passwordChangeRequired: true } } });
      return;
    }
    const stale = Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000;
    if (stale) void prisma.authSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }

  req.tenant = {
    businessId: payload.businessId,
    businessSlug: payload.businessSlug,
    userId: payload.userId,
    source: 'auth'
  };

  const entitlements = await loadEntitlements(prisma, payload.businessId);
  const requiredFeature = ROUTE_FEATURES.find(([prefix]) => req.originalUrl.startsWith(prefix))?.[1];
  if (requiredFeature && !entitled(entitlements.features, requiredFeature)) {
    res.status(403).json({ ok: false, error: { message: 'Feature is not included in the current subscription', details: { featureKey: requiredFeature, upgradeRequired: true } } });
    return;
  }
  const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  const exemptWrite = req.originalUrl.startsWith('/api/v1/auth/') || req.originalUrl.startsWith('/api/v1/platform-admin/');
  if (isWrite && !exemptWrite && entitlements.readOnly) {
    res.status(402).json({ ok: false, error: { message: 'Subscription is read-only. Renew or contact support.' } });
    return;
  }

  next();
}
