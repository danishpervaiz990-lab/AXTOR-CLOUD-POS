import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';

export function requireIndustry(...allowedCodes: string[]) {
  const allowed = new Set(allowedCodes.map((value) => value.toLowerCase()));
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const businessId = req.tenant?.businessId;
    if (!businessId) { res.status(401).json({ ok:false, error:{ message:'Authenticated business is required' } }); return; }
    const selected = await prisma.businessIndustry.findUnique({ where:{ businessId }, include:{ industry:{ select:{ code:true } } } });
    const code = selected?.industry.code?.toLowerCase();
    if (!code || !allowed.has(code)) {
      res.status(403).json({ ok:false, error:{ message:'This route is not available for the tenant industry', details:{ allowedIndustries:[...allowed], tenantIndustry:code || null } } });
      return;
    }
    next();
  };
}
