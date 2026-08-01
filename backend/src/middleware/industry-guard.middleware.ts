import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { canonicalIndustryCode } from '../industry/codes.js';

export function requireIndustry(...allowedCodes: string[]) {
  const allowed = new Set(allowedCodes.map(canonicalIndustryCode).filter(Boolean));
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const businessId = req.tenant?.businessId;
    if (!businessId) {
      res.status(401).json({ ok: false, error: { code: 'TENANT_CONTEXT_REQUIRED', message: 'Authenticated business is required' } });
      return;
    }
    try {
      const selected = await prisma.businessIndustry.findUnique({ where: { businessId }, include: { industry: { select: { code: true } } } });
      const code = canonicalIndustryCode(selected?.industry.code);
      if (!code || !allowed.has(code)) {
        res.status(403).json({
          ok: false,
          error: {
            code: 'INDUSTRY_ACCESS_DENIED',
            message: 'This route is not available for the tenant industry',
            details: { allowedIndustries: [...allowed], tenantIndustry: code || null },
          },
        });
        return;
      }
      next();
    } catch (error) {
      console.error('Industry guard failed:', error);
      res.status(403).json({ ok: false, error: { code: 'INDUSTRY_ACCESS_DENIED', message: 'Industry access check failed' } });
    }
  };
}
