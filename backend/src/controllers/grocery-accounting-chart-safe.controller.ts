import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { ensureStandardGroceryAccounts } from "../services/grocery-accounting.service.js";
import { handleError, tenant } from "../utils/http.js";

const db: any = prisma;

export async function groceryChartOfAccountsSafe(req: Request, res: Response) {
  try {
    const t = tenant(req);
    const rows = await db.$transaction(async (tx: any) => {
      // Chart-of-accounts is a read surface, but first access bootstraps the
      // standard Grocery accounts. Multiple browser renders can reach this
      // endpoint together, so serialize that bootstrap per tenant.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`grocery-accounting:${t.businessId}`}))`;
      await ensureStandardGroceryAccounts(tx, t.businessId);
      return tx.account.findMany({
        where: { businessId: t.businessId, active: true },
        orderBy: [{ type: "asc" }, { accountNumber: "asc" }, { name: "asc" }],
      });
    });
    return res.json({ ok: true, data: rows });
  } catch (error) {
    return handleError(res, error);
  }
}
