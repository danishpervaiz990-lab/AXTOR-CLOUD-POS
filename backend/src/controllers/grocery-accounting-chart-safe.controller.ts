import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { ensureStandardGroceryAccounts } from "../services/grocery-accounting.service.js";
import { handleError, tenant } from "../utils/http.js";

const db: any = prisma;
const accountOrder = [{ type: "asc" }, { accountNumber: "asc" }, { name: "asc" }];

function isAccountBootstrapUniqueRace(error: any) {
  if (String(error?.code || "") !== "P2002") return false;
  const target = Array.isArray(error?.meta?.target)
    ? error.meta.target.join(" ")
    : String(error?.meta?.target || "");
  return !target || /name|accounts_business_id_name/i.test(target);
}

async function bootstrapAndReadAccounts(businessId: string) {
  return db.$transaction(async (tx: any) => {
    await ensureStandardGroceryAccounts(tx, businessId);
    return tx.account.findMany({
      where: { businessId, active: true },
      orderBy: accountOrder,
    });
  });
}

export async function groceryChartOfAccountsSafe(req: Request, res: Response) {
  try {
    const t = tenant(req);
    let rows;
    try {
      rows = await bootstrapAndReadAccounts(t.businessId);
    } catch (error) {
      // Concurrent first-use requests can both observe an empty chart. The
      // database unique key selects one winner; after that transaction commits,
      // the losing request can safely return the now-created standard accounts.
      if (!isAccountBootstrapUniqueRace(error)) throw error;
      rows = await db.account.findMany({
        where: { businessId: t.businessId, active: true },
        orderBy: accountOrder,
      });
    }
    return res.json({ ok: true, data: rows });
  } catch (error) {
    return handleError(res, error);
  }
}
