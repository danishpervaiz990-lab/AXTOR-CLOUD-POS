import type { Request, Response } from "express";
import { getDashboardSummary } from "../services/dashboard.service.js";
import { handleError, tenant } from "../utils/http.js";

export async function dashboardSummary(req: Request, res: Response): Promise<void> {
  try {
    const { businessId } = tenant(req);
    res.json({ ok: true, data: await getDashboardSummary(businessId) });
  } catch (error) { handleError(res, error); }
}
